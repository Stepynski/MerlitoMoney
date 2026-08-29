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

from auth import check_password, ensure_password_seeded
from db import get_conn, init_db, rows_to_dicts
from iban import is_valid_iban, normalize_iban

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


@app.get("/api/accounts", dependencies=[])
def list_accounts(request: Request):
    require_auth(request)
    with get_conn() as conn:
        accounts = rows_to_dicts(conn.execute("SELECT * FROM accounts ORDER BY id").fetchall())
        deltas = _account_balances(conn)
    for a in accounts:
        a["balance"] = a["starting_balance"] + deltas.get(a["id"], 0)
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
    fields = {k: v for k, v in body.dict().items() if v is not None}
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
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
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


# ---------- static frontend (mounted last so /api/* takes priority) ----------

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
