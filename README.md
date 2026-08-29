# MerlitoMoney

A self-hosted, single-user personal budgeting app built around the [Kakeibo](https://en.wikipedia.org/wiki/Kakeibo) philosophy — a small ledger that keeps asking: how much do I have, how much do I want to save, how much am I actually spending, and how can I improve.

Standalone FastAPI + SQLite backend, a vanilla-JS frontend (no build step, installable as a PWA), and Docker deployment. No external services, no accounts beyond your own.

## Features

- **Accounts** — spending and savings accounts, optional savings goals, IBAN (validated per ISO 13616/7064), close/reopen/delete with history preserved on close
- **Categories** and **Budgets** — per-category monthly limits with progress tracking
- **Movements** — expenses, income, and internal/external transfers, with an optional description and day-grouped filterable ledger
- **Recurring** — subscriptions and loan instalments, with daily/weekly/monthly/yearly schedules (any "every N"), a business-day-aware "Nth business day of the month" schedule (e.g. last business day), and an optional weekend shift for dates that land on a weekend
- **Overview** — a dashboard with net worth trend, spend/income breakdown, top categories, and budget status
- **Import** — pull transactions from your bank (via [Enable Banking](https://enablebanking.com/), 2,500+ banks across Europe) into a review queue. Nothing reaches your accounts until you approve it row by row: each one arrives with a suggested type, a remembered category, and — when it looks like something you already entered — the existing movement shown beside it to compare. Transfers between two of your own accounts are recognised by IBAN and imported once, not twice
- Four colour themes, each with light and dark variants

## Running it

```bash
git clone git@github.com:Stepynski/MerlitoMoney.git
cd MerlitoMoney
MERLITOMONEY_PASSWORD=your-password docker compose up --build -d
```

The app listens on port `8081`. `MERLITOMONEY_PASSWORD` sets the single login password on first run; the SQLite database lives in `./data`, bind-mounted for durability.

## Connecting a bank (optional)

Bank import needs an [Enable Banking](https://enablebanking.com/) application — free for personal use in their "restricted production" mode, which links only your own accounts.

1. Register the application and download its private key to `secrets/enable-banking-private-key.pem` (gitignored).
2. Register `https://<your-lan-ip>:8444/api/bank/callback` as a redirect URL on that application. Banks refuse a plain-http redirect, which is why the `caddy` service exists: it terminates TLS in front of the app using a self-signed certificate in `certs/` (also gitignored). Generate one with:

   ```bash
   openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout certs/importer.key -out certs/importer.crt -subj "/CN=<your-lan-ip>" -addext "subjectAltName=IP:<your-lan-ip>"
   ```

3. Put `ENABLEBANKING_APP_ID` and `ENABLEBANKING_REDIRECT_URL` in `.env`, then `docker compose up --build -d`.

Then open **Import**, connect the bank, point each account it reports at one of yours, and press *Fetch now*. Imports only ever run when you ask — there is no scheduler. Bank consent lasts about 90 days; the page counts down before it lapses.

Leave the credentials unset and the app runs exactly as before, with an empty Import page.

## Stack

- **Backend**: FastAPI + Python's `sqlite3` (no ORM) — see `backend/`
- **Frontend**: vanilla JS as ES modules, no build step — see `frontend/js/`
- **Data**: SQLite, additive migrations run automatically on startup

---

This repository previously hosted a [Firefly III](https://www.firefly-iii.org/) fork; that codebase has been retired in favor of this standalone rewrite.
