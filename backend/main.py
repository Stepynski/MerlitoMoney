import os
import secrets
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from auth import check_password, ensure_password_seeded, hash_password
from db import ensure_default_categories, get_conn, init_db, rows_to_dicts
from iban import is_valid_iban, normalize_iban
from datetime import date
from recurring import generate_due, next_occurrence, _add_months, _clamp_day, _months_between

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
SESSION_SECRET_PATH = DATA_DIR / ".session_secret"

app = FastAPI(title="MerlitoMoney")


def _session_secret() -> str:
    env_secret = os.environ.get("SESSION_SECRET")
    if env_secret:
        return env_secret
    if SESSION_SECRET_PATH.exists():
        return SESSION_SECRET_PATH.read_text().strip()
    secret = secrets.token_hex(32)
    SESSION_SECRET_PATH.write_text(secret)
    return secret


app.add_middleware(SessionMiddleware, secret_key=_session_secret())


@app.on_event("startup")
def startup():
    init_db()
    ensure_password_seeded()
    ensure_default_categories()
    with get_conn() as conn:
        generate_due(conn)


def require_auth(request: Request):
    if not request.session.get("authed"):
        raise HTTPException(status_code=401, detail="Not logged in")


# ---------- auth ----------

class LoginIn(BaseModel):
    password: str


@app.post("/api/login")
def login(body: LoginIn, request: Request):
    if not check_password(body.password):
        raise HTTPException(status_code=401, detail="Wrong password")
    request.session["authed"] = True
    return {"ok": True}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(request: Request):
    return {"authed": bool(request.session.get("authed"))}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/change-password")
def change_password(body: ChangePasswordIn, request: Request):
    require_auth(request)
    if not check_password(body.current_password):
        # Not 401: that status is special-cased client-side to mean "your
        # session expired, log out" — a wrong *current* password here must
        # not force the still-valid session back to the login screen.
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")
    with get_conn() as conn:
        conn.execute(
            "UPDATE config SET value = ? WHERE key = 'password_hash'",
            (hash_password(body.new_password),),
        )
    return {"ok": True}


class DeleteAllDataIn(BaseModel):
    password: str


@app.post("/api/danger/delete-all")
def delete_all_data(body: DeleteAllDataIn, request: Request):
    require_auth(request)
    if not check_password(body.password):
        # Same reasoning as change_password: 400, not 401, so a wrong
        # confirmation password doesn't get treated as an expired session.
        raise HTTPException(status_code=400, detail="Wrong password")
    with get_conn() as conn:
        # Delete in FK-dependency order: transactions reference accounts/
        # categories/recurring_rules, recurring_rules reference accounts,
        # budgets reference categories.
        conn.execute("DELETE FROM transactions")
        conn.execute("DELETE FROM recurring_rules")
        conn.execute("DELETE FROM budgets")
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM categories")
    ensure_default_categories()
    return {"ok": True}


# ---------- accounts ----------

class AccountIn(BaseModel):
    name: str
    type: str
    icon: str
    color: str
    grp: str
    starting_balance: float = 0
    goal_amount: Optional[float] = None
    iban: Optional[str] = None


class AccountPatch(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    grp: Optional[str] = None
    starting_balance: Optional[float] = None
    goal_amount: Optional[float] = None
    iban: Optional[str] = None
    bank_connection_id: Optional[str] = None
    active: Optional[bool] = None


def _clean_iban(raw: Optional[str]) -> Optional[str]:
    if raw is None or not raw.strip():
        return None
    iban = normalize_iban(raw)
    if not is_valid_iban(iban):
        raise HTTPException(status_code=400, detail="Invalid IBAN")
    return iban


def _account_balances(conn) -> dict:
    """account_id -> net change from all transactions touching it."""
    balances: dict = {}
    for row in conn.execute(
        "SELECT account_id, type, amount FROM transactions"
    ):
        delta = row["amount"] if row["type"] == "Income" else -row["amount"]
        balances[row["account_id"]] = balances.get(row["account_id"], 0) + delta
    for row in conn.execute(
        "SELECT to_account_id, amount FROM transactions "
        "WHERE type = 'Transfer internal' AND to_account_id IS NOT NULL"
    ):
        balances[row["to_account_id"]] = balances.get(row["to_account_id"], 0) + row["amount"]
    return balances


def _autopay_rule(conn, card_account_id):
    return conn.execute(
        "SELECT * FROM recurring_rules WHERE to_account_id = ? AND amount_mode = 'full_balance'",
        (card_account_id,),
    ).fetchone()


def _loan_rule(conn, loan_account_id):
    return conn.execute(
        "SELECT * FROM recurring_rules WHERE to_account_id = ? AND amount_mode = 'amortized'",
        (loan_account_id,),
    ).fetchone()


@app.get("/api/accounts", dependencies=[])
def list_accounts(request: Request):
    require_auth(request)
    with get_conn() as conn:
        accounts = rows_to_dicts(conn.execute("SELECT * FROM accounts ORDER BY id").fetchall())
        deltas = _account_balances(conn)
        for a in accounts:
            a["balance"] = a["starting_balance"] + deltas.get(a["id"], 0)
            a["autopay"] = None
            a["loan"] = None
            if a["grp"] == "credit":
                rule = _autopay_rule(conn, a["id"])
                if rule:
                    after = date.fromisoformat(rule["last_generated_date"]) if rule["last_generated_date"] else None
                    nxt = next_occurrence(dict(rule), after) if rule["active"] else None
                    a["autopay"] = {
                        "enabled": bool(rule["active"]),
                        "from_account_id": rule["account_id"],
                        "day_of_month": rule["day_of_month"],
                        "weekend_rule": rule["weekend_rule"],
                        "next_date": nxt.isoformat() if nxt else None,
                    }
            elif a["grp"] == "loan":
                rule = _loan_rule(conn, a["id"])
                if rule:
                    after = date.fromisoformat(rule["last_generated_date"]) if rule["last_generated_date"] else None
                    nxt = next_occurrence(dict(rule), after) if rule["active"] else None
                    end = date.fromisoformat(rule["end_date"])
                    a["loan"] = {
                        "from_account_id": rule["account_id"],
                        "annual_rate": rule["annual_rate"],
                        "category_id": rule["category_id"],
                        "day_of_month": rule["day_of_month"],
                        "weekend_rule": rule["weekend_rule"],
                        "term_months_remaining": _months_between(nxt, end) if nxt else 0,
                        "next_date": nxt.isoformat() if nxt else None,
                        "paid_off": not bool(rule["active"]),
                    }
    return accounts


@app.post("/api/accounts")
def create_account(body: AccountIn, request: Request):
    require_auth(request)
    iban = _clean_iban(body.iban)
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO accounts (name, type, icon, color, grp, starting_balance, goal_amount, iban) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (body.name, body.type, body.icon, body.color, body.grp, body.starting_balance, body.goal_amount, iban),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="This IBAN is already used by another account")
        return {"id": cur.lastrowid}


@app.patch("/api/accounts/{account_id}")
def update_account(account_id: int, body: AccountPatch, request: Request):
    require_auth(request)
    fields = body.dict(exclude_unset=True)
    if "iban" in fields:
        fields["iban"] = _clean_iban(fields["iban"])
    if not fields:
        return {"ok": True}
    with get_conn() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        try:
            conn.execute(
                f"UPDATE accounts SET {set_clause} WHERE id = ?",
                (*fields.values(), account_id),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="This IBAN is already used by another account")
    return {"ok": True}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int, request: Request):
    require_auth(request)
    with get_conn() as conn:
        # Recurring rules FK-reference accounts too (e.g. a credit card's
        # autopay, or any subscription paid from this account) — unlink the
        # transactions they generated (same policy as deleting a recurring
        # rule directly: keep the historical transactions) then delete the
        # rules, before deleting transactions/accounts, or the deletes below
        # fail under PRAGMA foreign_keys = ON.
        conn.execute(
            "UPDATE transactions SET recurring_id = NULL WHERE recurring_id IN "
            "(SELECT id FROM recurring_rules WHERE account_id = ? OR to_account_id = ?)",
            (account_id, account_id),
        )
        conn.execute("DELETE FROM recurring_rules WHERE account_id = ? OR to_account_id = ?", (account_id, account_id))
        # Transactions FK-reference accounts with no ON DELETE action, so any
        # transaction touching this account (either side of a transfer) must
        # go first, or the DELETE below fails under PRAGMA foreign_keys = ON.
        conn.execute("DELETE FROM transactions WHERE account_id = ? OR to_account_id = ?", (account_id, account_id))
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    return {"ok": True}


class AutopayIn(BaseModel):
    enabled: bool
    from_account_id: Optional[int] = None
    day_of_month: Optional[int] = None
    weekend_rule: str = "none"


@app.put("/api/accounts/{account_id}/autopay")
def set_autopay(account_id: int, body: AutopayIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        card = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not card:
            raise HTTPException(status_code=404, detail="Account not found")
        existing = _autopay_rule(conn, account_id)
        if not body.enabled:
            # No grp check on the disable path: this also has to work as a
            # cleanup call when an account is edited away from 'credit'.
            if existing:
                conn.execute("UPDATE recurring_rules SET active = 0 WHERE id = ?", (existing["id"],))
            return {"ok": True}
        if card["grp"] != "credit":
            raise HTTPException(status_code=400, detail="Not a credit card account")
        if body.from_account_id is None or body.day_of_month is None:
            raise HTTPException(status_code=400, detail="from_account_id and day_of_month are required to enable autopay")
        if not 1 <= body.day_of_month <= 31:
            raise HTTPException(status_code=400, detail="day_of_month must be between 1 and 31")
        if body.weekend_rule not in ("none", "before", "after"):
            raise HTTPException(status_code=400, detail="Invalid weekend_rule")
        from_account = conn.execute("SELECT id FROM accounts WHERE id = ?", (body.from_account_id,)).fetchone()
        if not from_account:
            raise HTTPException(status_code=400, detail="from_account_id does not exist")
        if existing:
            conn.execute(
                "UPDATE recurring_rules SET account_id = ?, day_of_month = ?, weekend_rule = ?, active = 1 WHERE id = ?",
                (body.from_account_id, body.day_of_month, body.weekend_rule, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO recurring_rules "
                "(name, type, account_id, to_account_id, amount, amount_mode, freq, interval_n, day_of_month, weekend_rule, start_date, active) "
                "VALUES (?, 'Transfer internal', ?, ?, NULL, 'full_balance', 'monthly', 1, ?, ?, ?, 1)",
                (f"{card['name']} autopay", body.from_account_id, account_id, body.day_of_month, body.weekend_rule, date.today().isoformat()),
            )
        generate_due(conn)
    return {"ok": True}


class LoanScheduleIn(BaseModel):
    from_account_id: int
    annual_rate: float
    term_months: int
    category_id: Optional[int] = None
    day_of_month: int
    weekend_rule: str = "none"


@app.put("/api/accounts/{account_id}/loan")
def set_loan_schedule(account_id: int, body: LoanScheduleIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        loan = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not loan or loan["grp"] != "loan":
            raise HTTPException(status_code=400, detail="Not a loan account")
        if not 1 <= body.day_of_month <= 31:
            raise HTTPException(status_code=400, detail="day_of_month must be between 1 and 31")
        if body.weekend_rule not in ("none", "before", "after"):
            raise HTTPException(status_code=400, detail="Invalid weekend_rule")
        if body.annual_rate < 0:
            raise HTTPException(status_code=400, detail="annual_rate cannot be negative")
        if body.term_months < 1:
            raise HTTPException(status_code=400, detail="term_months must be at least 1")
        from_account = conn.execute("SELECT id FROM accounts WHERE id = ?", (body.from_account_id,)).fetchone()
        if not from_account:
            raise HTTPException(status_code=400, detail="from_account_id does not exist")

        existing = _loan_rule(conn, account_id)
        # Anchor the term to the *next* real payment date, whether that's
        # the very first payment (new loan, no history yet) or the next
        # upcoming one (editing an existing schedule, e.g. a refinance) —
        # so "term_months" always means "months remaining from here", never
        # a total that would silently re-count already-made payments.
        if existing:
            start_date = existing["start_date"]
            after = date.fromisoformat(existing["last_generated_date"]) if existing["last_generated_date"] else None
        else:
            start_date = date.today().isoformat()
            after = None
        temp_rule = {"start_date": start_date, "freq": "monthly", "interval_n": 1,
                     "day_of_month": body.day_of_month, "weekend_rule": "none"}
        first_occ = next_occurrence(temp_rule, after)
        end_year, end_month = _add_months(first_occ.year, first_occ.month, body.term_months - 1)
        end_day = _clamp_day(end_year, end_month, body.day_of_month)
        end_date = date(end_year, end_month, end_day).isoformat()

        if existing:
            conn.execute(
                "UPDATE recurring_rules SET account_id = ?, category_id = ?, annual_rate = ?, "
                "day_of_month = ?, weekend_rule = ?, end_date = ?, active = 1 WHERE id = ?",
                (body.from_account_id, body.category_id, body.annual_rate, body.day_of_month,
                 body.weekend_rule, end_date, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO recurring_rules "
                "(name, type, account_id, to_account_id, category_id, amount, amount_mode, annual_rate, "
                "freq, interval_n, day_of_month, weekend_rule, start_date, end_date, active) "
                "VALUES (?, 'Transfer internal', ?, ?, ?, NULL, 'amortized', ?, 'monthly', 1, ?, ?, ?, ?, 1)",
                (f"{loan['name']} payment", body.from_account_id, account_id, body.category_id,
                 body.annual_rate, body.day_of_month, body.weekend_rule, start_date, end_date),
            )
        generate_due(conn)
    return {"ok": True}


# ---------- categories ----------

class CategoryIn(BaseModel):
    name: str
    kind: str
    icon: str
    color: str


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


@app.get("/api/categories")
def list_categories(request: Request):
    require_auth(request)
    with get_conn() as conn:
        return rows_to_dicts(conn.execute("SELECT * FROM categories ORDER BY id").fetchall())


@app.post("/api/categories")
def create_category(body: CategoryIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO categories (name, kind, icon, color) VALUES (?, ?, ?, ?)",
            (body.name, body.kind, body.icon, body.color),
        )
        return {"id": cur.lastrowid}


@app.patch("/api/categories/{category_id}")
def update_category(category_id: int, body: CategoryPatch, request: Request):
    require_auth(request)
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        return {"ok": True}
    with get_conn() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE categories SET {set_clause} WHERE id = ?",
            (*fields.values(), category_id),
        )
    return {"ok": True}


@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int, request: Request):
    require_auth(request)
    with get_conn() as conn:
        conn.execute("DELETE FROM budgets WHERE category_id = ?", (category_id,))
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    return {"ok": True}


# ---------- transactions ----------

class TransactionIn(BaseModel):
    date: str
    account_id: int
    to_account_id: Optional[int] = None
    type: str
    category_id: Optional[int] = None
    amount: float
    note: Optional[str] = None


@app.get("/api/transactions")
def list_transactions(request: Request, start: Optional[str] = None, end: Optional[str] = None):
    require_auth(request)
    query = "SELECT * FROM transactions"
    params: list = []
    if start and end:
        query += " WHERE date >= ? AND date <= ?"
        params = [start, end]
    query += " ORDER BY date DESC, id DESC"
    with get_conn() as conn:
        generate_due(conn)
        return rows_to_dicts(conn.execute(query, params).fetchall())


@app.post("/api/transactions")
def create_transaction(body: TransactionIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO transactions (date, account_id, to_account_id, type, category_id, amount, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (body.date, body.account_id, body.to_account_id, body.type, body.category_id, body.amount, body.note),
        )
        return {"id": cur.lastrowid}


class TransactionPatch(BaseModel):
    account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    amount: Optional[float] = None
    note: Optional[str] = None


@app.patch("/api/transactions/{transaction_id}")
def update_transaction(transaction_id: int, body: TransactionPatch, request: Request):
    require_auth(request)
    fields = body.dict(exclude_unset=True)
    if not fields:
        return {"ok": True}
    with get_conn() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id = ?",
            (*fields.values(), transaction_id),
        )
    return {"ok": True}


@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, request: Request):
    require_auth(request)
    with get_conn() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
    return {"ok": True}


# ---------- budgets ----------

class BudgetIn(BaseModel):
    category_id: int
    monthly_limit: float


@app.get("/api/budgets")
def list_budgets(request: Request):
    require_auth(request)
    with get_conn() as conn:
        return rows_to_dicts(conn.execute("SELECT * FROM budgets").fetchall())


@app.post("/api/budgets")
def set_budget(body: BudgetIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO budgets (category_id, monthly_limit) VALUES (?, ?) "
            "ON CONFLICT(category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit",
            (body.category_id, body.monthly_limit),
        )
    return {"ok": True}


@app.delete("/api/budgets/{category_id}")
def delete_budget(category_id: int, request: Request):
    require_auth(request)
    with get_conn() as conn:
        conn.execute("DELETE FROM budgets WHERE category_id = ?", (category_id,))
    return {"ok": True}


# ---------- recurring rules (subscriptions, loans, ...) ----------

class RecurringIn(BaseModel):
    name: str
    type: str
    account_id: int
    to_account_id: Optional[int] = None
    category_id: Optional[int] = None
    amount: float
    note: Optional[str] = None
    freq: str
    interval_n: int = 1
    weekday: Optional[int] = None
    day_of_month: Optional[int] = None
    month_of_year: Optional[int] = None
    nth_business_day: Optional[int] = None
    weekend_rule: str = "none"
    start_date: str
    end_date: Optional[str] = None


class RecurringPatch(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    category_id: Optional[int] = None
    amount: Optional[float] = None
    note: Optional[str] = None
    freq: Optional[str] = None
    interval_n: Optional[int] = None
    weekday: Optional[int] = None
    day_of_month: Optional[int] = None
    month_of_year: Optional[int] = None
    nth_business_day: Optional[int] = None
    weekend_rule: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    active: Optional[bool] = None


def _validate_recurring(freq, interval_n, weekday, day_of_month, month_of_year, nth_business_day):
    if interval_n is None or interval_n < 1:
        raise HTTPException(status_code=400, detail="interval_n must be at least 1")
    if freq == "weekly" and (weekday is None or not 0 <= weekday <= 6):
        raise HTTPException(status_code=400, detail="Weekly frequency requires a weekday (0-6)")
    if freq in ("monthly", "yearly") and (day_of_month is None or not 1 <= day_of_month <= 31):
        raise HTTPException(status_code=400, detail=f"{freq.capitalize()} frequency requires day_of_month (1-31)")
    if freq == "yearly" and (month_of_year is None or not 1 <= month_of_year <= 12):
        raise HTTPException(status_code=400, detail="Yearly frequency requires month_of_year (1-12)")
    if freq == "monthly_nth_business_day" and (nth_business_day is None or nth_business_day == 0 or not -31 <= nth_business_day <= 31):
        raise HTTPException(status_code=400, detail="monthly_nth_business_day requires a non-zero nth_business_day")


@app.get("/api/recurring")
def list_recurring(request: Request):
    require_auth(request)
    with get_conn() as conn:
        generate_due(conn)
        rules = rows_to_dicts(conn.execute("SELECT * FROM recurring_rules ORDER BY id").fetchall())
    for r in rules:
        r["next_date"] = None
        if r["active"]:
            after = date.fromisoformat(r["last_generated_date"]) if r["last_generated_date"] else None
            nxt = next_occurrence(r, after)
            if nxt and (not r["end_date"] or nxt <= date.fromisoformat(r["end_date"])):
                r["next_date"] = nxt.isoformat()
    return rules


@app.post("/api/recurring")
def create_recurring(body: RecurringIn, request: Request):
    require_auth(request)
    _validate_recurring(body.freq, body.interval_n, body.weekday, body.day_of_month, body.month_of_year, body.nth_business_day)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO recurring_rules (name, type, account_id, to_account_id, category_id, amount, note, "
            "freq, interval_n, weekday, day_of_month, month_of_year, nth_business_day, weekend_rule, start_date, end_date) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (body.name, body.type, body.account_id, body.to_account_id, body.category_id, body.amount, body.note,
             body.freq, body.interval_n, body.weekday, body.day_of_month, body.month_of_year, body.nth_business_day,
             body.weekend_rule, body.start_date, body.end_date),
        )
        generate_due(conn)
        return {"id": cur.lastrowid}


@app.patch("/api/recurring/{recurring_id}")
def update_recurring(recurring_id: int, body: RecurringPatch, request: Request):
    require_auth(request)
    fields = body.dict(exclude_unset=True)
    if not fields:
        return {"ok": True}
    if any(k in fields for k in ("freq", "interval_n", "weekday", "day_of_month", "month_of_year", "nth_business_day")):
        with get_conn() as conn:
            existing = conn.execute("SELECT * FROM recurring_rules WHERE id = ?", (recurring_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Recurring rule not found")
        merged = dict(existing)
        merged.update(fields)
        _validate_recurring(merged["freq"], merged["interval_n"], merged["weekday"], merged["day_of_month"], merged["month_of_year"], merged["nth_business_day"])
    with get_conn() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE recurring_rules SET {set_clause} WHERE id = ?",
            (*fields.values(), recurring_id),
        )
        generate_due(conn)
    return {"ok": True}


@app.delete("/api/recurring/{recurring_id}")
def delete_recurring(recurring_id: int, request: Request):
    require_auth(request)
    with get_conn() as conn:
        # Keep already-generated transactions (the charges genuinely happened);
        # only unlink them, since recurring_id has no ON DELETE action.
        conn.execute("UPDATE transactions SET recurring_id = NULL WHERE recurring_id = ?", (recurring_id,))
        conn.execute("DELETE FROM recurring_rules WHERE id = ?", (recurring_id,))
    return {"ok": True}


# ---------- static frontend (mounted last so /api/* takes priority) ----------

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
