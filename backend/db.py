import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "merlitomoney.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA_PATH.read_text())
        _migrate(conn)


def _migrate(conn):
    """Additive column migrations for databases created before a schema change."""
    for stmt in (
        "ALTER TABLE accounts ADD COLUMN iban TEXT",
        "ALTER TABLE accounts ADD COLUMN bank_connection_id TEXT",
    ):
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_iban ON accounts(iban) WHERE iban IS NOT NULL")


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def rows_to_dicts(rows):
    return [dict(r) for r in rows]
