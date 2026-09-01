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
        "ALTER TABLE accounts ADD COLUMN include_in_net_worth INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE transactions ADD COLUMN recurring_id INTEGER REFERENCES recurring_rules(id)",
        "ALTER TABLE import_staging ADD COLUMN from_account_id INTEGER REFERENCES accounts(id)",
    ):
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_iban ON accounts(iban) WHERE iban IS NOT NULL")
    _rebuild_accounts_grp_check(conn)
    _rebuild_recurring_amount_mode(conn)


def _grp_check_includes_loan(conn) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'"
    ).fetchone()
    return row is not None and "'loan'" in row["sql"]


def _rebuild_accounts_grp_check(conn):
    """SQLite can't ALTER a CHECK constraint in place — rebuild the table.
    Guarded by _grp_check_includes_loan (not "credit") so this one rebuild
    correctly upgrades a fresh db, a credit-only-migrated db, or an
    already-loan-migrated db (no-op) in a single idempotent pass — the
    target schema below is always the latest, not a chain of steps."""
    if _grp_check_includes_loan(conn):
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("""
        CREATE TABLE accounts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL,
            grp TEXT NOT NULL CHECK (grp IN ('spend', 'save', 'credit', 'loan')),
            starting_balance REAL NOT NULL DEFAULT 0,
            goal_amount REAL,
            iban TEXT,
            bank_connection_id TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            include_in_net_worth INTEGER NOT NULL DEFAULT 1
        )
    """)
    conn.execute("""
        INSERT INTO accounts_new (id, name, type, icon, color, grp, starting_balance, goal_amount, iban, bank_connection_id, active, include_in_net_worth)
        SELECT id, name, type, icon, color, grp, starting_balance, goal_amount, iban, bank_connection_id, active, include_in_net_worth FROM accounts
    """)
    conn.execute("DROP TABLE accounts")
    conn.execute("ALTER TABLE accounts_new RENAME TO accounts")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_iban ON accounts(iban) WHERE iban IS NOT NULL")
    bad = conn.execute("PRAGMA foreign_key_check").fetchall()
    if bad:
        raise RuntimeError(f"accounts table rebuild broke referential integrity: {bad}")
    conn.execute("PRAGMA foreign_keys = ON")


def _recurring_has_annual_rate(conn) -> bool:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(recurring_rules)")}
    return "annual_rate" in cols


def _rebuild_recurring_amount_mode(conn):
    """Relaxes amount to nullable and adds amount_mode + annual_rate —
    all require a table rebuild in SQLite (no ALTER for dropping NOT NULL
    or extending a CHECK). Guarded by _recurring_has_annual_rate (not the
    older "has amount_mode" check) so this single rebuild correctly
    upgrades a fresh db, a credit-only-migrated db (has amount_mode but
    not annual_rate), or an already-loan-migrated db (no-op) — the target
    schema below is always the latest, not a chain of steps."""
    if _recurring_has_annual_rate(conn):
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("""
        CREATE TABLE recurring_rules_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('Expense', 'Income', 'Transfer internal')),
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            to_account_id INTEGER REFERENCES accounts(id),
            category_id INTEGER REFERENCES categories(id),
            amount REAL,
            amount_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (amount_mode IN ('fixed', 'full_balance', 'amortized')),
            annual_rate REAL,
            note TEXT,
            freq TEXT NOT NULL CHECK (freq IN ('daily', 'weekly', 'monthly', 'yearly', 'monthly_nth_business_day')),
            interval_n INTEGER NOT NULL DEFAULT 1,
            weekday INTEGER,
            day_of_month INTEGER,
            month_of_year INTEGER,
            nth_business_day INTEGER,
            weekend_rule TEXT NOT NULL DEFAULT 'none' CHECK (weekend_rule IN ('none', 'before', 'after')),
            start_date TEXT NOT NULL,
            end_date TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            last_generated_date TEXT
        )
    """)
    existing_cols = {r["name"] for r in conn.execute("PRAGMA table_info(recurring_rules)")}
    amount_mode_expr = "amount_mode" if "amount_mode" in existing_cols else "'fixed'"
    conn.execute(f"""
        INSERT INTO recurring_rules_new (
            id, name, type, account_id, to_account_id, category_id, amount, amount_mode, note, freq, interval_n,
            weekday, day_of_month, month_of_year, nth_business_day, weekend_rule, start_date, end_date,
            active, last_generated_date
        )
        SELECT
            id, name, type, account_id, to_account_id, category_id, amount, {amount_mode_expr}, note, freq, interval_n,
            weekday, day_of_month, month_of_year, nth_business_day, weekend_rule, start_date, end_date,
            active, last_generated_date
        FROM recurring_rules
    """)
    conn.execute("DROP TABLE recurring_rules")
    conn.execute("ALTER TABLE recurring_rules_new RENAME TO recurring_rules")
    bad = conn.execute("PRAGMA foreign_key_check").fetchall()
    if bad:
        raise RuntimeError(f"recurring_rules table rebuild broke referential integrity: {bad}")
    conn.execute("PRAGMA foreign_keys = ON")


@contextmanager
def get_conn():
    # timeout is SQLite's busy_timeout: a connection that finds the database
    # locked waits (retrying) instead of raising "database is locked"
    # immediately, which BEGIN IMMEDIATE below now makes possible to hit
    # routinely.
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Every request-scoped connection takes its write lock immediately,
    # before its first SELECT, rather than SQLite's default of deferring
    # it until the first write. Deferred acquisition let two concurrent
    # requests both read recurring_rules.last_generated_date as "not yet
    # generated" before either had written anything, so both then inserted
    # the same due occurrence — generate_due() is called from most of the
    # read endpoints the frontend fetches in parallel on every page load,
    # so any day a rule became due was exactly wide enough a window to hit.
    # BEGIN IMMEDIATE serializes them: the second connection blocks here
    # until the first commits, then sees last_generated_date already
    # updated and correctly generates nothing.
    conn.execute("BEGIN IMMEDIATE")
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
    ("Loan Interest", "expense", "ic-percent", "#e03b34"),
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
