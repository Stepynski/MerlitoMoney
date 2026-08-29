CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    grp TEXT NOT NULL CHECK (grp IN ('spend', 'save')),
    starting_balance REAL NOT NULL DEFAULT 0,
    goal_amount REAL,
    iban TEXT,
    bank_connection_id TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    icon TEXT NOT NULL,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER REFERENCES accounts(id),
    type TEXT NOT NULL CHECK (type IN ('Expense', 'Income', 'Transfer internal', 'Transfer external')),
    category_id INTEGER REFERENCES categories(id),
    amount REAL NOT NULL,
    note TEXT,
    external_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS budgets (
    category_id INTEGER PRIMARY KEY REFERENCES categories(id),
    monthly_limit REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
