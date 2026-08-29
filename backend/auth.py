import hashlib
import hmac
import os
import secrets

from db import get_conn

ITERATIONS = 200_000


def _hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _hash(password, salt)
    return salt.hex() + ":" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split(":")
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    return hmac.compare_digest(_hash(password, salt), expected)


def ensure_password_seeded():
    """On first run, hash MERLITOMONEY_PASSWORD (env var) into the config table."""
    with get_conn() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'password_hash'"
        ).fetchone()
        if row is None:
            plain = os.environ.get("MERLITOMONEY_PASSWORD")
            if not plain:
                raise RuntimeError(
                    "No password set yet. Set MERLITOMONEY_PASSWORD in the environment "
                    "for the first run so a login password can be created."
                )
            conn.execute(
                "INSERT INTO config (key, value) VALUES ('password_hash', ?)",
                (hash_password(plain),),
            )


def check_password(password: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'password_hash'"
        ).fetchone()
    return row is not None and verify_password(password, row["value"])
