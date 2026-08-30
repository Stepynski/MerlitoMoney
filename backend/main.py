import csv
import io
import json
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from auth import check_password, ensure_password_seeded, hash_password
import enablebanking
from bankimport import StaleLinkError, commit_staged, movement_type, refresh_matches, stage_rows
from db import ensure_default_categories, get_conn, init_db, rows_to_dicts
from iban import is_valid_iban, normalize_iban
from datetime import date, datetime
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
        conn.execute("DELETE FROM import_staging")
        conn.execute("DELETE FROM import_ledger")
        conn.execute("DELETE FROM payee_rules")
        conn.execute("DELETE FROM bank_feeds")
        conn.execute("DELETE FROM bank_connections")
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
    include_in_net_worth: Optional[bool] = None


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
    include_in_net_worth: Optional[bool] = None


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
                        "rule_id": rule["id"],
                        "start_date": rule["start_date"],
                        "end_date": rule["end_date"],
                    }
    return accounts


@app.post("/api/accounts")
def create_account(body: AccountIn, request: Request):
    require_auth(request)
    iban = _clean_iban(body.iban)
    # A mortgage/car loan is usually secured against an asset (a house, a
    # car) this app has no way to track, so counting the full liability
    # with no offsetting asset systematically understates net worth —
    # default loans out, everything else in, but let the caller override.
    include_in_net_worth = body.include_in_net_worth
    if include_in_net_worth is None:
        include_in_net_worth = body.grp != "loan"
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO accounts (name, type, icon, color, grp, starting_balance, goal_amount, iban, include_in_net_worth) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (body.name, body.type, body.icon, body.color, body.grp, body.starting_balance, body.goal_amount, iban, include_in_net_worth),
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
        # Anything staged for this account is unreviewed bank data with nowhere
        # left to land, so it goes; the bank feed itself is kept but unlinked,
        # because its import history in import_ledger is still worth having if
        # the account is ever recreated.
        conn.execute("DELETE FROM import_staging WHERE account_id = ? OR to_account_id = ?", (account_id, account_id))
        conn.execute("UPDATE bank_feeds SET account_id = NULL, sync_enabled = 0 WHERE account_id = ?", (account_id,))
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
        # Staged rows and remembered payees point at categories too; clear the
        # suggestion rather than let it block the delete.
        conn.execute("UPDATE import_staging SET category_id = NULL WHERE category_id = ?", (category_id,))
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


# ---------- data export / backup ----------

# Parent tables before children, matching FK direction — reused for both
# insert order (on restore) and to know which tables round-trip at all.
#
# import_ledger and payee_rules belong here as much as the ledger itself does:
# they are what stops an already-decided bank transaction being imported a
# second time, and what remembers how each payee is categorised. Restoring a
# backup without them would silently re-offer every transaction ever imported.
# import_staging is deliberately absent — it holds unreviewed bank data that is
# meaningless once the accounts around it have been replaced.
BACKUP_TABLES = [
    "categories", "accounts", "recurring_rules", "transactions", "budgets",
    "bank_connections", "bank_feeds", "payee_rules", "import_ledger",
]


@app.get("/api/export/transactions.csv")
def export_transactions_csv(request: Request):
    require_auth(request)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT t.date, t.type, a1.name AS account, a2.name AS to_account, "
            "c.name AS category, t.amount, t.note "
            "FROM transactions t "
            "JOIN accounts a1 ON a1.id = t.account_id "
            "LEFT JOIN accounts a2 ON a2.id = t.to_account_id "
            "LEFT JOIN categories c ON c.id = t.category_id "
            "ORDER BY t.date, t.id"
        ).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Type", "Account", "To account", "Category", "Amount", "Note"])
    for r in rows:
        writer.writerow([
            r["date"], r["type"], r["account"], r["to_account"] or "",
            r["category"] or "", f'{r["amount"]:.2f}', r["note"] or "",
        ])
    filename = f"merlitomoney-transactions-{date.today().isoformat()}.csv"
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/backup/export")
def export_backup(request: Request):
    require_auth(request)
    with get_conn() as conn:
        payload = {
            "app": "MerlitoMoney",
            "backup_version": 1,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "tables": {
                t: rows_to_dicts(conn.execute(f"SELECT * FROM {t}").fetchall())
                for t in BACKUP_TABLES
            },
        }
    filename = f"merlitomoney-backup-{date.today().isoformat()}.json"
    return Response(
        content=json.dumps(payload, indent=2), media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class BackupImportIn(BaseModel):
    password: str
    data: dict


@app.post("/api/backup/import")
def import_backup(body: BackupImportIn, request: Request):
    require_auth(request)
    if not check_password(body.password):
        raise HTTPException(status_code=400, detail="Wrong password")
    tables = body.data.get("tables")
    if not isinstance(tables, dict) or not any(t in tables for t in BACKUP_TABLES):
        raise HTTPException(status_code=400, detail="This doesn't look like a MerlitoMoney backup file")
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        # Unreviewed bank rows describe accounts that are about to be replaced,
        # so they cannot meaningfully survive a restore.
        conn.execute("DELETE FROM import_staging")
        # Wipe children before parents (same order as /api/danger/delete-all),
        # then restore parents before children so FKs are always satisfied.
        for t in reversed(BACKUP_TABLES):
            conn.execute(f"DELETE FROM {t}")
        for t in BACKUP_TABLES:
            rows = tables.get(t) or []
            cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({t})")]
            for row in rows:
                if not isinstance(row, dict):
                    raise HTTPException(status_code=400, detail=f"Malformed row in '{t}'")
                present = [c for c in cols if c in row]
                placeholders = ", ".join("?" for _ in present)
                conn.execute(
                    f"INSERT INTO {t} ({', '.join(present)}) VALUES ({placeholders})",
                    tuple(row[c] for c in present),
                )
            if "id" in cols:
                conn.execute(
                    "UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM " + t + ") WHERE name = ?",
                    (t,),
                )
        bad = conn.execute("PRAGMA foreign_key_check").fetchall()
        conn.execute("PRAGMA foreign_keys = ON")
        if bad:
            raise HTTPException(status_code=400, detail="Backup file failed referential integrity checks — nothing was changed")
    return {"ok": True}


# ---------- bank import ----------

class BankFeedIn(BaseModel):
    uuid: str
    name: Optional[str] = None
    iban: Optional[str] = None
    currency: Optional[str] = None
    connection_id: Optional[int] = None
    account_id: Optional[int] = None


class BankFeedPatch(BaseModel):
    account_id: Optional[int] = None
    sync_enabled: Optional[bool] = None
    retired: Optional[bool] = None


@app.get("/api/import/feeds")
def list_bank_feeds(request: Request):
    require_auth(request)
    with get_conn() as conn:
        feeds = rows_to_dicts(conn.execute("SELECT * FROM bank_feeds ORDER BY name, uuid").fetchall())
        connections = rows_to_dicts(conn.execute("SELECT * FROM bank_connections ORDER BY id").fetchall())
    return {"feeds": feeds, "connections": connections}


@app.post("/api/import/feeds")
def upsert_bank_feed(body: BankFeedIn, request: Request):
    require_auth(request)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO bank_feeds (uuid, connection_id, account_id, iban, name, currency) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(uuid) DO UPDATE SET "
            "connection_id = COALESCE(excluded.connection_id, connection_id), "
            "iban = COALESCE(excluded.iban, iban), name = COALESCE(excluded.name, name), "
            "currency = COALESCE(excluded.currency, currency)",
            (body.uuid, body.connection_id, body.account_id, body.iban, body.name, body.currency),
        )
    return {"ok": True}


@app.patch("/api/import/feeds/{feed_uuid}")
def update_bank_feed(feed_uuid: str, body: BankFeedPatch, request: Request):
    require_auth(request)
    fields = body.dict(exclude_unset=True)
    if not fields:
        return {"ok": True}
    with get_conn() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE bank_feeds SET {set_clause} WHERE uuid = ?", (*fields.values(), feed_uuid))
    return {"ok": True}


class StageRowIn(BaseModel):
    feed_uuid: str
    booking_date: str
    amount: float
    direction: str
    entry_reference: Optional[str] = None
    value_date: Optional[str] = None
    currency: Optional[str] = None
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    remittance: Optional[str] = None
    status: Optional[str] = None
    raw: Optional[dict] = None


class StageIn(BaseModel):
    rows: list


@app.post("/api/import/stage")
def stage_bank_rows(body: StageIn, request: Request):
    require_auth(request)
    rows = []
    for raw in body.rows:
        row = StageRowIn(**raw).dict()
        if row["direction"] not in ("in", "out"):
            raise HTTPException(status_code=400, detail="direction must be 'in' or 'out'")
        rows.append(row)
    with get_conn() as conn:
        return stage_rows(conn, rows)


@app.get("/api/import/staged")
def list_staged(request: Request):
    require_auth(request)
    with get_conn() as conn:
        # Suggestions are recomputed on every read rather than frozen at fetch
        # time, so a queue left open while the user keeps entering movements by
        # hand still reflects what the ledger holds now.
        refresh_matches(conn)
        rows = rows_to_dicts(
            conn.execute("SELECT * FROM import_staging ORDER BY booking_date DESC, id").fetchall()
        )
        # The suggested duplicate is shown side by side with the bank row, so
        # the user can judge the suggestion instead of trusting it.
        for row in rows:
            # What the row will actually become, derived from its two sides,
            # so the page never shows a type the commit would disagree with.
            row["movement_type"] = movement_type(row)
            row["match"] = None
            if row["match_tx_id"]:
                hit = conn.execute(
                    "SELECT t.id, t.date, t.type, t.amount, t.note, c.name AS category "
                    "FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.id = ?",
                    (row["match_tx_id"],),
                ).fetchone()
                row["match"] = dict(hit) if hit else None
    return rows


class StagedPatch(BaseModel):
    decision: Optional[str] = None
    tx_type: Optional[str] = None
    category_id: Optional[int] = None
    from_account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    note: Optional[str] = None


@app.patch("/api/import/staged/{staged_id}")
def update_staged(staged_id: int, body: StagedPatch, request: Request):
    require_auth(request)
    fields = body.dict(exclude_unset=True)
    if not fields:
        return {"ok": True}
    if fields.get("decision") not in (None, "pending", "import", "skip", "link"):
        raise HTTPException(status_code=400, detail="Unknown decision")
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM import_staging WHERE id = ?", (staged_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No such row")
        if fields.get("decision") == "link" and not row["match_tx_id"]:
            raise HTTPException(status_code=400, detail="Nothing to link this to")
        merged = dict(row)
        merged.update(fields)
        if merged.get("from_account_id") and merged["from_account_id"] == merged.get("to_account_id"):
            raise HTTPException(status_code=400, detail="A transfer needs two different accounts")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE import_staging SET {set_clause} WHERE id = ?", (*fields.values(), staged_id))
    return {"ok": True}


@app.post("/api/import/commit")
def commit_import(request: Request):
    require_auth(request)
    try:
        with get_conn() as conn:
            return commit_staged(conn)
    except StaleLinkError as e:
        # The exception escapes get_conn() before it commits, so SQLite rolls
        # the whole thing back — nothing is half-imported.
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/api/import/cancel")
def cancel_import(request: Request):
    """Throw the whole queue away without importing anything.

    Deliberately leaves no trace in import_ledger: cancelling means the user
    has not decided, so the same rows should turn up again on the next sync.
    """
    require_auth(request)
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM import_staging")
    return {"discarded": cur.rowcount}


# ---------- bank connection (Enable Banking) ----------

@app.get("/api/bank/status")
def bank_status(request: Request):
    require_auth(request)
    with get_conn() as conn:
        connections = rows_to_dicts(
            conn.execute("SELECT * FROM bank_connections ORDER BY id DESC").fetchall()
        )
    return {"configured": enablebanking.is_configured(), "redirect_url": enablebanking.redirect_url(),
            "connections": connections}


@app.get("/api/bank/aspsps")
def bank_aspsps(request: Request, country: Optional[str] = None):
    require_auth(request)
    try:
        return enablebanking.list_aspsps(country)
    except (enablebanking.BankConfigError, enablebanking.BankApiError) as e:
        raise HTTPException(status_code=502, detail=str(e))


class BankConnectIn(BaseModel):
    aspsp_name: str
    country: str


@app.post("/api/bank/connect")
def bank_connect(body: BankConnectIn, request: Request):
    require_auth(request)
    state = enablebanking.new_state()
    try:
        auth = enablebanking.start_authorization(body.aspsp_name, body.country, state)
    except (enablebanking.BankConfigError, enablebanking.BankApiError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    with get_conn() as conn:
        # Only one authorisation can be in flight — the session holds a single
        # state — so any earlier pending row is an attempt that was abandoned
        # partway through, and would otherwise pile up forever.
        conn.execute("DELETE FROM bank_connections WHERE status = 'pending'")
        conn.execute(
            "INSERT INTO bank_connections (aspsp_name, aspsp_country, auth_id, valid_until, created_at, status) "
            "VALUES (?, ?, ?, ?, ?, 'pending')",
            (body.aspsp_name, body.country, auth["authorization_id"], auth["valid_until"],
             datetime.utcnow().isoformat()),
        )
    # The state is held in the session rather than the database: it exists only
    # to prove the browser coming back is the one that left.
    request.session["bank_state"] = state
    # The callback the bank hits lives behind Caddy on its own HTTPS port
    # (needed only because the bank refuses a plain-http redirect URL), which
    # is a different browser origin from wherever the app is normally used.
    # A bare "/" redirect there would strand the user on that second origin —
    # its own empty localStorage, so preferences like the theme look reset
    # even though nothing was actually lost — so where they started from is
    # remembered and used to send them back.
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    request.session["bank_return_origin"] = origin
    return {"url": auth["url"]}


@app.get("/api/bank/callback")
def bank_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None,
                  error: Optional[str] = None):
    """Where the bank sends the browser back after authorisation."""
    require_auth(request)
    expected = request.session.pop("bank_state", None)
    origin = request.session.pop("bank_return_origin", None) or ""

    def back_to(query):
        return RedirectResponse(origin + "/?" + query, status_code=303)

    if error:
        return back_to("bank_error=" + error)
    if not code or not state or state != expected:
        return back_to("bank_error=state_mismatch")
    try:
        session = enablebanking.create_session(code)
    except (enablebanking.BankConfigError, enablebanking.BankApiError) as e:
        return back_to("bank_error=" + str(e)[:120])

    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM bank_connections WHERE status = 'pending' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        connection_id = row["id"] if row else None
        if connection_id:
            conn.execute(
                "UPDATE bank_connections SET session_id = ?, valid_until = COALESCE(?, valid_until), "
                "status = 'active' WHERE id = ?",
                (session["session_id"], session.get("valid_until"), connection_id),
            )
        # Renewing a consent hands back brand new identifiers for the same real
        # accounts. Matching on IBAN carries the previous mapping across, so the
        # user does not have to redo it — and the old identifiers are kept, not
        # deleted, because transactions already imported still refer to them.
        for acc in session["accounts"]:
            inherited = None
            if acc.get("iban"):
                prev = conn.execute(
                    "SELECT account_id FROM bank_feeds WHERE iban = ? AND account_id IS NOT NULL "
                    "AND uuid != ? ORDER BY rowid DESC LIMIT 1",
                    (acc["iban"], acc["uid"]),
                ).fetchone()
                if prev:
                    inherited = prev["account_id"]
                    conn.execute(
                        "UPDATE bank_feeds SET retired = 1 WHERE iban = ? AND uuid != ?",
                        (acc["iban"], acc["uid"]),
                    )
            conn.execute(
                "INSERT INTO bank_feeds (uuid, connection_id, account_id, iban, name, currency) "
                "VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(uuid) DO UPDATE SET connection_id = excluded.connection_id, "
                "iban = COALESCE(excluded.iban, iban), name = COALESCE(excluded.name, name), "
                "currency = COALESCE(excluded.currency, currency), retired = 0",
                (acc["uid"], connection_id, inherited, acc.get("iban"), acc.get("name"), acc.get("currency")),
            )
    return back_to("bank_connected=1")


class BankSyncIn(BaseModel):
    days: int = 30
    feed_uuids: Optional[list] = None


@app.post("/api/bank/sync")
def bank_sync(body: BankSyncIn, request: Request):
    """Fetch recent transactions into the review queue. Never runs on its own."""
    require_auth(request)
    date_from, date_to = enablebanking.window(body.days)
    with get_conn() as conn:
        query = "SELECT * FROM bank_feeds WHERE account_id IS NOT NULL AND sync_enabled = 1 AND retired = 0"
        feeds = rows_to_dicts(conn.execute(query).fetchall())
    if body.feed_uuids:
        feeds = [f for f in feeds if f["uuid"] in body.feed_uuids]
    if not feeds:
        raise HTTPException(status_code=400, detail="No bank accounts are set up to sync")

    rows, balances, errors = [], {}, []
    for feed in feeds:
        try:
            for tx in enablebanking.fetch_transactions(feed["uuid"], date_from, date_to):
                rows.append(enablebanking.normalize(tx, feed["uuid"]))
            balances[feed["uuid"]] = enablebanking.fetch_balance(feed["uuid"])
        except (enablebanking.BankConfigError, enablebanking.BankApiError) as e:
            # One bank being unreachable must not throw away what the others
            # returned; the queue is additive and the failure is reported.
            errors.append({"feed": feed["name"] or feed["uuid"], "error": str(e)})

    with get_conn() as conn:
        result = stage_rows(conn, rows)
        for uuid_, bal in balances.items():
            conn.execute("UPDATE bank_feeds SET last_synced_at = ? WHERE uuid = ?",
                         (datetime.utcnow().isoformat(), uuid_))
        # A bank's own figure next to ours catches the silent drift that
        # happens when a feed omits some movements entirely.
        drift = []
        for feed in feeds:
            reported = balances.get(feed["uuid"])
            if reported is None:
                continue
            row = conn.execute("SELECT starting_balance FROM accounts WHERE id = ?", (feed["account_id"],)).fetchone()
            if not row:
                continue
            delta = conn.execute(
                "SELECT COALESCE(SUM(CASE WHEN type = 'Income' THEN amount "
                "WHEN type IN ('Expense', 'Transfer external') THEN -amount ELSE 0 END), 0) "
                "+ COALESCE((SELECT SUM(amount) FROM transactions WHERE to_account_id = ? AND type = 'Transfer internal'), 0) "
                "- COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ? AND type = 'Transfer internal'), 0) "
                "FROM transactions WHERE account_id = ?",
                (feed["account_id"], feed["account_id"], feed["account_id"]),
            ).fetchone()[0]
            ours = row["starting_balance"] + (delta or 0)
            drift.append({"feed": feed["name"] or feed["uuid"], "bank": reported, "app": round(ours, 2)})

    result["errors"] = errors
    result["balances"] = drift
    result["window"] = {"from": date_from, "to": date_to}
    return result


# ---------- static frontend (mounted last so /api/* takes priority) ----------

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
