# MerlitoMoney

A self-hosted, single-user personal budgeting app built around the [Kakeibo](https://en.wikipedia.org/wiki/Kakeibo) philosophy — a small ledger that keeps asking: how much do I have, how much do I want to save, how much am I actually spending, and how can I improve.

Standalone FastAPI + SQLite backend, a vanilla-JS frontend (no build step, installable as a PWA), and Docker deployment. No external services, no accounts beyond your own.

## Features

- **Accounts** — spending and savings accounts, optional savings goals, IBAN (validated per ISO 13616/7064), close/reopen/delete with history preserved on close
- **Categories** and **Budgets** — per-category monthly limits with progress tracking
- **Movements** — expenses, income, and internal/external transfers, with an optional description and day-grouped filterable ledger
- **Recurring** — subscriptions and loan instalments, with daily/weekly/monthly/yearly schedules (any "every N"), a business-day-aware "Nth business day of the month" schedule (e.g. last business day), and an optional weekend shift for dates that land on a weekend
- **Overview** — a dashboard with net worth trend, spend/income breakdown, top categories, and budget status
- Four colour themes, each with light and dark variants

## Running it

```bash
git clone git@github.com:Stepynski/MerlitoMoney.git
cd MerlitoMoney
MERLITOMONEY_PASSWORD=your-password docker compose up --build -d
```

The app listens on port `8081`. `MERLITOMONEY_PASSWORD` sets the single login password on first run; the SQLite database lives in `./data`, bind-mounted for durability.

## Stack

- **Backend**: FastAPI + Python's `sqlite3` (no ORM) — see `backend/`
- **Frontend**: vanilla JS as ES modules, no build step — see `frontend/js/`
- **Data**: SQLite, additive migrations run automatically on startup

---

This repository previously hosted a [Firefly III](https://www.firefly-iii.org/) fork; that codebase has been retired in favor of this standalone rewrite.
