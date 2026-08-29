"""Enable Banking client: consent, account discovery and transaction fetch.

Everything here stops at producing normalised rows. Deciding what those rows
mean, and whether they duplicate something already recorded, belongs to
bankimport.py — keeping the network layer free of that logic is what let the
matching engine be built and tested without a live bank.
"""

import os
import time
import uuid
from datetime import date, datetime, timedelta

API_BASE = os.environ.get("ENABLEBANKING_API_BASE", "https://api.enablebanking.com")
KEY_FILE = os.environ.get("ENABLEBANKING_KEY_FILE", "/app/secrets/enable-banking-private-key.pem")

# PSD2 consents top out at 90 days, after which the bank demands a fresh
# strong-authentication. Ask for slightly less so the expiry we show is never
# optimistic.
CONSENT_DAYS = 89

# Under PSD2 a bank need only serve four unattended requests per account per
# day. Imports here are always user-initiated, but a wide window paginates
# into several calls, so pages are capped rather than followed forever.
MAX_PAGES = 10


class BankConfigError(Exception):
    """Enable Banking credentials are missing or unreadable."""


class BankApiError(Exception):
    """The bank or Enable Banking refused a request."""


def is_configured():
    return bool(os.environ.get("ENABLEBANKING_APP_ID")) and os.path.exists(KEY_FILE)


def redirect_url():
    return os.environ.get("ENABLEBANKING_REDIRECT_URL", "")


def _deps():
    """Imported lazily so a deployment without the bank extras still boots.

    httpx and PyJWT are only needed to talk to a bank; the rest of the app —
    including the whole review queue — works without them, and a missing
    dependency should degrade to "no bank configured" rather than refusing to
    start at all.
    """
    try:
        import httpx
        import jwt
    except ImportError as e:
        raise BankConfigError(f"Bank support needs httpx and PyJWT installed: {e}")
    return httpx, jwt


def _auth_header():
    _httpx, jwt = _deps()
    app_id = os.environ.get("ENABLEBANKING_APP_ID")
    if not app_id:
        raise BankConfigError("ENABLEBANKING_APP_ID is not set")
    try:
        key = open(KEY_FILE, "rb").read()
    except OSError as e:
        raise BankConfigError(f"Cannot read {KEY_FILE}: {e}")
    now = int(time.time())
    token = jwt.encode(
        {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600},
        key,
        algorithm="RS256",
        headers={"typ": "JWT", "kid": app_id},
    )
    return {"Authorization": "Bearer " + token}


def _request(method, path, **kwargs):
    httpx, _jwt = _deps()
    try:
        with httpx.Client(timeout=45) as client:
            res = client.request(method, API_BASE + path, headers=_auth_header(), **kwargs)
    except httpx.HTTPError as e:
        raise BankApiError(f"Could not reach the bank: {e}")
    if res.status_code >= 400:
        detail = res.text[:400]
        raise BankApiError(f"Bank returned {res.status_code}: {detail}")
    return res.json()


# ---------- consent ----------

def list_aspsps(country=None):
    data = _request("GET", "/aspsps")
    banks = data.get("aspsps", [])
    if country:
        banks = [b for b in banks if (b.get("country") or "").upper() == country.upper()]
    return [{"name": b.get("name"), "country": b.get("country"), "logo": b.get("logo")} for b in banks]


def start_authorization(aspsp_name, country, state):
    target = redirect_url()
    if not target:
        raise BankConfigError("ENABLEBANKING_REDIRECT_URL is not set")
    valid_until = (datetime.utcnow() + timedelta(days=CONSENT_DAYS)).replace(microsecond=0).isoformat() + "Z"
    body = {
        "access": {"valid_until": valid_until},
        "aspsp": {"name": aspsp_name, "country": country},
        "state": state,
        "redirect_url": target,
        "psu_type": "personal",
    }
    data = _request("POST", "/auth", json=body)
    return {"url": data.get("url"), "authorization_id": data.get("authorization_id"), "valid_until": valid_until}


def create_session(code):
    """Exchange the code from the bank's redirect for a usable session."""
    data = _request("POST", "/sessions", json={"code": code})
    accounts = []
    for a in data.get("accounts", []):
        ident = a.get("account_id") or {}
        accounts.append({
            "uid": a.get("uid") or a.get("resource_id"),
            "iban": ident.get("iban"),
            "currency": a.get("currency"),
            "name": a.get("name") or a.get("product") or (a.get("details") or ""),
        })
    return {
        "session_id": data.get("session_id"),
        "accounts": [a for a in accounts if a["uid"]],
        "aspsp": data.get("aspsp") or {},
        "valid_until": (data.get("access") or {}).get("valid_until"),
    }


# ---------- data ----------

def fetch_transactions(account_uid, date_from, date_to):
    raw = []
    params = {"date_from": date_from, "date_to": date_to}
    for _ in range(MAX_PAGES):
        data = _request("GET", f"/accounts/{account_uid}/transactions", params=params)
        raw.extend(data.get("transactions", []))
        key = data.get("continuation_key")
        if not key:
            break
        params = {"date_from": date_from, "date_to": date_to, "continuation_key": key}
    return raw


def fetch_balance(account_uid):
    """The bank's own figure, shown next to ours purely as a drift check."""
    data = _request("GET", f"/accounts/{account_uid}/balances")
    for b in data.get("balances", []):
        amount = (b.get("balance_amount") or {}).get("amount")
        if amount is not None:
            return float(amount)
    return None


def _party_iban(node):
    if not isinstance(node, dict):
        return None
    return node.get("iban") or ((node.get("other") or {}).get("identification") if isinstance(node.get("other"), dict) else None)


def normalize(tx, feed_uuid):
    """Turn one Enable Banking transaction into a row bankimport understands."""
    indicator = (tx.get("credit_debit_indicator") or "").upper()
    # The spec spells the debit indicator DBIT; some documentation and some
    # banks say DBDT. Treat anything that is not an explicit credit as money
    # going out rather than guessing an inbound payment.
    incoming = indicator == "CRDT"
    direction = "in" if incoming else "out"

    amount_node = tx.get("transaction_amount") or {}
    counterparty = (tx.get("debtor") if incoming else tx.get("creditor")) or {}
    counterparty_account = (tx.get("debtor_account") if incoming else tx.get("creditor_account")) or {}

    remittance = tx.get("remittance_information")
    if isinstance(remittance, list):
        remittance = " ".join(str(x) for x in remittance if x)
    remittance = (remittance or "").strip() or None

    return {
        "feed_uuid": feed_uuid,
        "entry_reference": tx.get("entry_reference") or tx.get("transaction_id"),
        "booking_date": tx.get("booking_date") or tx.get("value_date") or tx.get("transaction_date"),
        "value_date": tx.get("value_date"),
        "amount": abs(float(amount_node.get("amount") or 0)),
        "direction": direction,
        "currency": amount_node.get("currency"),
        "counterparty_name": counterparty.get("name"),
        "counterparty_iban": _party_iban(counterparty_account),
        "remittance": remittance,
        "status": (tx.get("status") or "").upper() or None,
        "raw": tx,
    }


def new_state():
    return uuid.uuid4().hex


def window(days):
    """A lookback window, clamped to what a consent can actually serve."""
    days = max(1, min(int(days or 30), 730))
    today = date.today()
    return (today - timedelta(days=days)).isoformat(), today.isoformat()
