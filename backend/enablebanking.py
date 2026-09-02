"""Enable Banking client: consent, account discovery and transaction fetch.

Everything here stops at producing normalised rows. Deciding what those rows
mean, and whether they duplicate something already recorded, belongs to
bankimport.py — keeping the network layer free of that logic is what let the
matching engine be built and tested without a live bank.

Credentials (App ID + private key) can come from either the environment (the
original, ops-only mechanism) or from the DB config table (set through an
in-app setup flow). The environment always wins when present — see
load_credentials() — so an existing deployment that already has
ENABLEBANKING_APP_ID / ENABLEBANKING_KEY_FILE set keeps behaving exactly as
before and can never be silently overridden from the UI.
"""

import hashlib
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta

from db import get_conn

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

# config table keys for the DB-stored fallback credentials.
CONFIG_APP_ID_KEY = "enablebanking_app_id"
CONFIG_KEY_PEM_KEY = "enablebanking_key_pem"
CONFIG_KEY_UPDATED_KEY = "enablebanking_key_updated_at"


class BankConfigError(Exception):
    """Enable Banking credentials are missing or unreadable."""


class BankApiError(Exception):
    """The bank or Enable Banking refused a request."""


# ---------- credential storage ----------

def _env_app_id():
    return os.environ.get("ENABLEBANKING_APP_ID") or None


def _env_key_present():
    """Whether an env-configured key *file* exists at all.

    Used to decide precedence and to refuse silent no-op saves — a file
    being merely present is what pins this field to "env", independently of
    whether it can actually be read or parsed (that distinction matters
    because "present but broken" is exactly the case is_configured() used
    to get wrong).
    """
    return os.path.exists(KEY_FILE)


def _env_key_bytes():
    """Best-effort read of the env-configured key file.

    Must never raise: this is called from status/describe paths that need
    to stay safe to hit on every page load. A file that exists but can't be
    read (permissions, transient I/O) comes back as None here and is
    reported to the caller as key_present=False rather than an exception.
    """
    try:
        with open(KEY_FILE, "rb") as f:
            return f.read()
    except OSError:
        return None


def _db_get(key):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _db_set(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def _db_delete(key):
    with get_conn() as conn:
        conn.execute("DELETE FROM config WHERE key = ?", (key,))


def load_credentials():
    """Resolve the App ID and private key from env (first) or DB (fallback).

    Returns a dict with app_id, key_pem (bytes, or None), and app_id_source
    / key_source each one of "env", "db" or None — the source is what lets
    describe_config() explain to the UI *why* a field is read-only, and lets
    save_credentials() refuse a write that env would silently shadow.
    Deliberately never raises: this is called on every /api/bank/status hit.
    """
    env_app_id = _env_app_id()
    if env_app_id:
        app_id, app_id_source = env_app_id, "env"
    else:
        db_app_id = _db_get(CONFIG_APP_ID_KEY)
        app_id, app_id_source = (db_app_id, "db") if db_app_id else (None, None)

    if _env_key_present():
        # The file is what pins the source to "env", even if it turns out
        # to be unreadable — see _env_key_present()'s docstring.
        key_pem, key_source = _env_key_bytes(), "env"
    else:
        db_key = _db_get(CONFIG_KEY_PEM_KEY)
        key_pem, key_source = (db_key.encode(), "db") if db_key else (None, None)

    return {
        "app_id": app_id,
        "key_pem": key_pem,
        "app_id_source": app_id_source,
        "key_source": key_source,
    }


def save_credentials(app_id=None, key_pem=None):
    """Validate and persist DB-stored credentials. None leaves a field alone.

    Refuses (BankConfigError) to write a field currently pinned by an env
    var/file — that write would have zero visible effect (load_credentials()
    would keep returning the env value), and a setup form that silently
    swallows the value the user just typed is worse than one that explains
    why it can't be used.
    """
    if app_id is not None:
        if _env_app_id():
            raise BankConfigError(
                "The App ID is set via the ENABLEBANKING_APP_ID environment variable and "
                "can't be changed here — unset it on the server to manage it from the app."
            )
        app_id = app_id.strip()
        if not app_id:
            raise BankConfigError("App ID cannot be empty.")
        _db_set(CONFIG_APP_ID_KEY, app_id)

    if key_pem is not None:
        if _env_key_present():
            raise BankConfigError(
                f"The private key is set via the file at {KEY_FILE} and can't be changed "
                "here — remove that file on the server to manage the key from the app."
            )
        normalized = validate_key_pem(key_pem)
        _db_set(CONFIG_KEY_PEM_KEY, normalized)
        _db_set(CONFIG_KEY_UPDATED_KEY, datetime.utcnow().replace(microsecond=0).isoformat() + "Z")

    return describe_config()


def clear_credentials():
    """Remove DB-stored credentials only. Env is never touched by this app."""
    _db_delete(CONFIG_APP_ID_KEY)
    _db_delete(CONFIG_KEY_PEM_KEY)
    _db_delete(CONFIG_KEY_UPDATED_KEY)


def describe_config():
    """Everything the UI needs to render the setup screen, nothing secret.

    key_pem itself must never appear here — this dict is serialized straight
    to the browser as JSON.
    """
    creds = load_credentials()
    key_present = bool(creds["key_pem"])
    fingerprint = None
    if key_present:
        try:
            fingerprint = key_fingerprint(creds["key_pem"])
        except BankConfigError:
            # Present but unusable (corrupt file, wrong key type, etc) — no
            # fingerprint to show, but still worth reporting key_present so
            # the UI can say "there's a key here, and it's broken" rather
            # than "there's no key".
            fingerprint = None
    # Only meaningful when the current key actually comes from the DB — an
    # env-pinned key was never touched through this app, and showing a
    # leftover DB timestamp next to it would misleadingly suggest otherwise.
    updated_at = _db_get(CONFIG_KEY_UPDATED_KEY) if creds["key_source"] == "db" else None
    return {
        "configured": is_configured(),
        "app_id": creds["app_id"],
        "app_id_source": creds["app_id_source"],
        "key_present": key_present,
        "key_source": creds["key_source"],
        "key_fingerprint": fingerprint,
        "key_updated_at": updated_at,
        "env_locked": creds["app_id_source"] == "env" or creds["key_source"] == "env",
    }


def is_configured():
    """True only when an App ID and key are both present *and* the key
    actually parses.

    Replaces the old bool(app_id) and os.path.exists(KEY_FILE), which said
    "configured" for an unreadable file, a corrupt key or a key/App-ID
    mismatch it had no way to catch. Cheap enough for every /api/bank/status
    request — at most one DB read plus one RSA key parse — and, per
    contract, never raises.
    """
    try:
        creds = load_credentials()
        if not creds["app_id"] or not creds["key_pem"]:
            return False
        validate_key_pem(creds["key_pem"])
        return True
    except Exception:
        return False


def redirect_url():
    return os.environ.get("ENABLEBANKING_REDIRECT_URL", "")


# ---------- validation ----------

def validate_key_pem(pem):
    """Parse a PEM private key, raising a plain-English BankConfigError on
    anything that would otherwise surface as a cryptic exception deep inside
    PyJWT during signing. Accepts str or bytes; returns normalized PEM text
    (str) suitable for storing in the DB.

    Called both when the setup UI submits a new key and internally (from
    is_configured()/describe_config()) to make sure a key that is merely
    *present* on disk or in the DB is actually usable.
    """
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
    except ImportError as e:
        # Same philosophy as _deps(): a missing optional dependency must
        # degrade to a clear error, never break app startup or this module's
        # import.
        raise BankConfigError(f"Key validation needs the 'cryptography' package installed: {e}")

    data = pem.encode() if isinstance(pem, str) else pem
    text = data.decode("utf-8", errors="replace").strip()

    if "-----BEGIN" not in text:
        raise BankConfigError("That doesn't look like a PEM private key — it should begin with -----BEGIN.")
    if "PRIVATE KEY" not in text:
        if "PUBLIC KEY" in text:
            raise BankConfigError("That's a public key — Enable Banking needs the private key instead.")
        raise BankConfigError("That doesn't look like a private key — Enable Banking needs a PEM-encoded RSA private key.")

    try:
        key = serialization.load_pem_private_key(data, password=None)
    except TypeError:
        # cryptography raises TypeError (not ValueError) specifically when a
        # password is required but none was given — that's the one failure
        # mode worth a distinct message.
        raise BankConfigError("This key is encrypted with a passphrase, which isn't supported — export an unencrypted private key.")
    except Exception as e:
        raise BankConfigError(f"Could not parse this private key: {e}")

    if not isinstance(key, rsa.RSAPrivateKey):
        raise BankConfigError("Enable Banking requires an RSA private key; this key is a different type.")

    return text


def key_fingerprint(pem):
    """A short, readable fingerprint of the key's *public* half, so the UI
    can show which key is loaded without ever exposing the private key.

    Derived from the DER-encoded SubjectPublicKeyInfo rather than the raw
    PEM text, so re-wrapping the same key (different line endings, a stray
    blank line) still produces the same, stable fingerprint.
    """
    try:
        from cryptography.hazmat.primitives import serialization
    except ImportError as e:
        raise BankConfigError(f"Key validation needs the 'cryptography' package installed: {e}")

    data = pem.encode() if isinstance(pem, str) else pem
    try:
        key = serialization.load_pem_private_key(data, password=None)
    except Exception as e:
        raise BankConfigError(f"Could not parse this private key: {e}")

    public_der = key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    digest = hashlib.sha256(public_der).hexdigest()[:16]
    return ":".join(digest[i:i + 2] for i in range(0, len(digest), 2))


def friendly_error(exc):
    """Turn a BankConfigError/BankApiError into one sentence a non-developer
    can act on.

    This repo has no live Enable Banking credentials, so no real error
    payload has ever been observed here. Matching is deliberately loose but
    defensive: HTTP status plus case-insensitive substrings, each mapping to
    one plausible cause, and — critically — falling back to the raw message
    whenever nothing matches. A mapping that confidently guesses wrong is
    worse than showing the original text; the raw text stays reachable
    either way (it's exactly what's returned on no match).
    """
    text = str(exc)
    lower = text.lower()

    if isinstance(exc, BankConfigError):
        # Config errors are already written by this module in plain English
        # (see validate_key_pem, save_credentials, _auth_header) — nothing
        # to translate.
        return text

    status = None
    m = re.match(r"bank returned (\d+):", lower)
    if m:
        status = int(m.group(1))

    if "could not reach the bank" in lower or "timed out" in lower:
        return "Could not reach Enable Banking — check the server's internet connection and try again."

    if status == 429 or "too many requests" in lower or "rate limit" in lower:
        return ("The bank is rate-limiting requests — PSD2 only guarantees a handful of "
                "unattended calls per account per day. Wait a while and try again.")

    if "kid" in lower and ("unknown" in lower or "invalid" in lower or "not found" in lower):
        return "Enable Banking didn't recognise the App ID — double-check it against the Enable Banking control panel."

    if ("sandbox" in lower and "production" in lower) or "wrong environment" in lower:
        return "These credentials look like they're for the wrong environment — sandbox credentials won't work against production, or vice versa."

    if "redirect" in lower and any(w in lower for w in ("not registered", "not match", "mismatch", "invalid")):
        return "The redirect URL isn't registered for this application, or doesn't match exactly — check it against the Enable Banking control panel."

    if status == 401 or "unauthorized" in lower or "invalid signature" in lower or "signature verification" in lower:
        return "Enable Banking rejected the credentials — the App ID or private key may be wrong, or the key doesn't match the App ID."

    if "consent" in lower and ("expired" in lower or "revoked" in lower or "invalid" in lower):
        return "The bank consent has expired or been revoked — reconnect this bank account."

    return text


def test_credentials(country=None):
    """Mint a JWT and call /aspsps — the cheapest authenticated endpoint — to
    prove the App ID and key actually work together against the bank, not
    just that they parse locally.

    Never raises: a failed test is itself the useful result, so every
    failure path is caught here and turned into a verdict for the UI.
    """
    try:
        banks = list_aspsps(country=country, include_sandbox=True)
    except (BankConfigError, BankApiError) as e:
        return {"ok": False, "message": friendly_error(e), "detail": str(e)}
    except Exception as e:
        # Anything else (a bug here, an unexpected response shape) still
        # has to come back as a verdict, not an exception reaching main.py.
        return {"ok": False, "message": "Unexpected error while testing the connection.", "detail": str(e)}

    countries = sorted({b["country"] for b in banks if b.get("country")})
    plural = "y" if len(countries) == 1 else "ies"
    return {
        "ok": True,
        "message": f"Success — found {len(banks)} bank(s) across {len(countries)} countr{plural}.",
        "bank_count": len(banks),
        "countries": countries,
    }


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
    creds = load_credentials()
    app_id = creds["app_id"]
    if not app_id:
        raise BankConfigError("No Enable Banking App ID is configured.")
    key = creds["key_pem"]
    if not key:
        raise BankConfigError("No Enable Banking private key is configured.")
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

def list_aspsps(country=None, include_sandbox=False):
    """List banks Enable Banking knows about.

    Optionally scoped to a country, and by default excluding sandbox-only
    entries (useless to a real user, and would otherwise clutter the bank
    picker). The exact field name Enable Banking uses to mark a sandbox
    entry isn't verifiable from here (no credentials exist in this repo to
    inspect a live response), so several plausible keys are tried and any
    truthy value counts as sandbox. Critically: if *no* entry in the
    response carries any of these keys, that's treated as "this response
    shape doesn't expose the flag" rather than "everything is sandbox" —
    filtering by a field that turned out not to exist would silently empty
    the whole list, which is worse than showing a sandbox bank by mistake.
    """
    data = _request("GET", "/aspsps")
    banks = data.get("aspsps", [])
    if country:
        banks = [b for b in banks if (b.get("country") or "").upper() == country.upper()]

    sandbox_keys = ("sandbox", "is_sandbox", "test", "environment")

    def _sandbox_flag(b):
        for k in sandbox_keys:
            if k in b:
                v = b[k]
                if isinstance(v, str):
                    return v.strip().lower() in ("sandbox", "test", "true", "1", "yes")
                return bool(v)
        return None  # no recognisable flag on this entry

    flags = [_sandbox_flag(b) for b in banks]
    any_flag_present = any(f is not None for f in flags)

    result = []
    for b, flag in zip(banks, flags):
        is_sandbox = bool(flag)
        if any_flag_present and not include_sandbox and is_sandbox:
            continue
        result.append({
            "name": b.get("name"),
            "country": b.get("country"),
            "logo": b.get("logo"),
            "sandbox": is_sandbox,
        })
    return result


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
    """The bank's own figure, shown next to ours purely as a drift check.

    A bank typically returns several balance types (Berlin Group/NextGenPSD2
    codes): CLBD (closing booked), ITBD (interim booked), XPCD (expected,
    includes pending), and others. MerlitoMoney only ever imports booked
    transactions, so comparing against anything that includes pending ones
    would show a drift that isn't real, defeating the point of the check —
    it exists to catch the bank's feed silently omitting a booked movement
    (the known Revolut vault-transfer case), not to flag pending activity
    the app was never going to import anyway. Prefer the booked types and
    only fall back to whatever else is present if neither is offered.
    """
    data = _request("GET", f"/accounts/{account_uid}/balances")
    balances = data.get("balances", [])
    for wanted in ("CLBD", "ITBD"):
        for b in balances:
            if (b.get("balance_type") or "").upper() == wanted:
                amount = (b.get("balance_amount") or {}).get("amount")
                if amount is not None:
                    return float(amount)
    for b in balances:
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
