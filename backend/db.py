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
        "ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE transactions ADD COLUMN recurring_id INTEGER REFERENCES recurring_rules(id)",
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


# (name, kind, icon, color) — a personal-finance-standard budgeting category
# set (the categories most household budgets track, split so fixed costs
# aren't lumped in with discretionary ones), only seeded into a brand-new
# (empty) database, never overwriting a user's own categories.
DEFAULT_CATEGORIES = [
    ("Housing", "expense", "ic-home", "#7048c8"),
    ("Utilities", "expense", "ic-bulb", "#f2a25c"),
    ("Groceries", "expense", "ic-cart", "#4caf50"),
    ("Dining Out", "expense", "ic-fork", "#f4703a"),
    ("Transport", "expense", "ic-car", "#1f6fd0"),
    ("Health & Wellness", "expense", "ic-health", "#12897f"),
    ("Shopping", "expense", "ic-bag", "#ef5b8c"),
    ("Entertainment & Subscriptions", "expense", "ic-play", "#26aee8"),
    ("Personal Care", "expense", "ic-scissors", "#e8a33d"),
    ("Insurance", "expense", "ic-shield", "#a531b5"),
    ("Education", "expense", "ic-graduation", "#5b46b8"),
    ("Gifts & Donations", "expense", "ic-gift", "#c0173f"),
    ("Savings & Investments", "expense", "ic-piggy", "#b6d334"),
    ("Other Expenses", "expense", "ic-dots", "#8b6ce0"),
    ("Salary", "income", "ic-salary", "#2f9e44"),
    ("Freelance & Business", "income", "ic-briefcase", "#26aee8"),
    ("Investments & Interest", "income", "ic-chart", "#12897f"),
    ("Gifts Received", "income", "ic-gift", "#e8a33d"),
    ("Other Income", "income", "ic-dots", "#5b46b8"),
]


def ensure_default_categories():
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO categories (name, kind, icon, color) VALUES (?, ?, ?, ?)",
                DEFAULT_CATEGORIES,
            )
