CREATE TABLE IF NOT EXISTS accounts (
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
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    icon TEXT NOT NULL,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_rules (
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
    external_id TEXT UNIQUE,
    recurring_id INTEGER REFERENCES recurring_rules(id)
);

CREATE TABLE IF NOT EXISTS budgets (
    category_id INTEGER PRIMARY KEY REFERENCES categories(id),
    monthly_limit REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

-- ---------- bank import ----------

-- One row per bank consent. PSD2 consents expire (roughly 90 days), after
-- which the bank must be re-authorised; valid_until is what the Import page
-- warns on.
CREATE TABLE IF NOT EXISTS bank_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aspsp_name TEXT NOT NULL,
    aspsp_country TEXT NOT NULL,
    auth_id TEXT,
    session_id TEXT,
    valid_until TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked'))
);

-- One row per bank-side account identifier ever seen, mapped onto one of our
-- own accounts. Deliberately many-to-one and never deleted: renewing a consent
-- issues brand new identifiers for the same real account, while transactions
-- already imported under the old one keep referring to it. Losing that mapping
-- is what made a previous implementation unable to recognise its own imports.
CREATE TABLE IF NOT EXISTS bank_feeds (
    uuid TEXT PRIMARY KEY,
    connection_id INTEGER REFERENCES bank_connections(id),
    account_id INTEGER REFERENCES accounts(id),
    iban TEXT,
    name TEXT,
    currency TEXT,
    sync_enabled INTEGER NOT NULL DEFAULT 1,
    retired INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT
);

-- The review queue. Rows sit here until the user decides what to do with each
-- one; nothing reaches the ledger before that.
CREATE TABLE IF NOT EXISTS import_staging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_uuid TEXT NOT NULL REFERENCES bank_feeds(uuid),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    fingerprint TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    value_date TEXT,
    amount REAL NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    currency TEXT,
    counterparty_name TEXT,
    counterparty_iban TEXT,
    remittance TEXT,
    raw_json TEXT,
    fetched_at TEXT NOT NULL,
    decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'import', 'skip', 'link')),
    tx_type TEXT,
    category_id INTEGER REFERENCES categories(id),
    to_account_id INTEGER REFERENCES accounts(id),
    note TEXT,
    -- Deliberately not a foreign key: this points at a transaction the user
    -- might delete while the row is still sitting in the queue, and a queued
    -- suggestion must never be able to block that delete.
    match_tx_id INTEGER,
    match_score REAL,
    match_reason TEXT,
    pair_id INTEGER,
    UNIQUE (feed_uuid, fingerprint)
);

-- Every decision ever made about a bank transaction, kept forever.
--
-- This table exists because of a specific failure: when the record of an
-- import lived only on the transaction itself, deleting that transaction
-- destroyed the evidence, and the next sync happily imported it again.
-- transaction_id is ON DELETE SET NULL precisely so the row survives its
-- transaction — the decision is remembered even once the ledger entry is gone.
CREATE TABLE IF NOT EXISTS import_ledger (
    feed_uuid TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('imported', 'skipped', 'linked')),
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    decided_at TEXT NOT NULL,
    PRIMARY KEY (feed_uuid, fingerprint)
);

-- Remembers how a counterparty was categorised so the next transaction from
-- the same shop, employer or person is pre-filled the same way.
CREATE TABLE IF NOT EXISTS payee_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_kind TEXT NOT NULL CHECK (match_kind IN ('iban', 'name')),
    match_value TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    tx_type TEXT,
    hits INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (match_kind, match_value)
);

CREATE INDEX IF NOT EXISTS idx_staging_decision ON import_staging(decision);
CREATE INDEX IF NOT EXISTS idx_staging_account ON import_staging(account_id);
CREATE INDEX IF NOT EXISTS idx_feeds_account ON bank_feeds(account_id);
