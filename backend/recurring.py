"""Pure date-math for recurring transaction rules, plus the generator that
materializes them into real transaction rows. "Business day" means Monday
through Friday only — no public-holiday calendar (holidays differ by
country and year; out of scope for now)."""

import calendar
from datetime import date, timedelta


def is_business_day(d):
    return d.weekday() < 5  # Monday=0 .. Sunday=6


def _shift_weekend(d, weekend_rule):
    if weekend_rule == 'none' or is_business_day(d):
        return d
    step = timedelta(days=-1 if weekend_rule == 'before' else 1)
    while not is_business_day(d):
        d += step
    return d


def _clamp_day(year, month, day):
    return min(day, calendar.monthrange(year, month)[1])


def _add_months(year, month, n):
    total = (year * 12 + (month - 1)) + n
    return total // 12, total % 12 + 1


def nth_business_day(year, month, nth):
    """nth=1 -> first business day of the month, nth=-1 -> last, etc."""
    last_day = calendar.monthrange(year, month)[1]
    biz_days = [date(year, month, d) for d in range(1, last_day + 1) if is_business_day(date(year, month, d))]
    if not biz_days:
        return None
    idx = nth - 1 if nth > 0 else nth
    if idx >= len(biz_days) or idx < -len(biz_days):
        return biz_days[-1] if nth > 0 else biz_days[0]
    return biz_days[idx]


def next_occurrence(rule, after):
    """Next occurrence date strictly after `after` (a date, or None for
    "nothing generated yet"), never before the rule's own start_date."""
    start = date.fromisoformat(rule['start_date'])
    floor = after if after and after >= start else start - timedelta(days=1)
    freq = rule['freq']
    n = rule['interval_n']

    if freq == 'daily':
        days_since = (floor - start).days
        k = (days_since // n) + 1
        return start + timedelta(days=k * n)

    if freq == 'weekly':
        delta = (rule['weekday'] - start.weekday()) % 7
        anchor = start + timedelta(days=delta)
        if floor < anchor:
            return anchor
        weeks_since = (floor - anchor).days // 7
        k = (weeks_since // n) + 1
        return anchor + timedelta(days=k * n * 7)

    if freq == 'monthly':
        months_since = (floor.year - start.year) * 12 + (floor.month - start.month)
        cycle = max(0, months_since // n)
        while True:
            year, month = _add_months(start.year, start.month, cycle * n)
            day = _clamp_day(year, month, rule['day_of_month'])
            candidate = _shift_weekend(date(year, month, day), rule['weekend_rule'])
            if candidate > floor:
                return candidate
            cycle += 1

    if freq == 'yearly':
        years_since = floor.year - start.year
        cycle = max(0, years_since // n)
        while True:
            year = start.year + cycle * n
            day = _clamp_day(year, rule['month_of_year'], rule['day_of_month'])
            candidate = _shift_weekend(date(year, rule['month_of_year'], day), rule['weekend_rule'])
            if candidate > floor:
                return candidate
            cycle += 1

    if freq == 'monthly_nth_business_day':
        months_since = (floor.year - start.year) * 12 + (floor.month - start.month)
        cycle = max(0, months_since // n)
        while True:
            year, month = _add_months(start.year, start.month, cycle * n)
            candidate = nth_business_day(year, month, rule['nth_business_day'])
            if candidate and candidate > floor:
                return candidate
            cycle += 1

    raise ValueError(f'unknown freq: {freq}')


def _account_balance(conn, account_id):
    """Current running balance for a single account — same formula as
    main.py's _account_balances(), scoped to one account since this module
    doesn't import from main.py (avoids a circular import)."""
    row = conn.execute("SELECT starting_balance FROM accounts WHERE id = ?", (account_id,)).fetchone()
    balance = row["starting_balance"]
    for r in conn.execute("SELECT type, amount FROM transactions WHERE account_id = ?", (account_id,)):
        balance += r["amount"] if r["type"] == "Income" else -r["amount"]
    for r in conn.execute(
        "SELECT amount FROM transactions WHERE to_account_id = ? AND type = 'Transfer internal'", (account_id,)
    ):
        balance += r["amount"]
    return balance


def _account_balance_asof(conn, account_id, cutoff_date):
    """Balance for account_id as of the end of cutoff_date — reconstructed
    by reversing every transaction dated after it out of the current
    balance. A missed autopay cycle, caught up once the app is opened
    again, must sweep what was actually owed on its own due date, not
    whatever has accumulated by today — which could include purchases made
    since, or an earlier missed cycle's own catch-up sweep already
    inserted earlier in this same pass. Without this, catching up several
    missed cycles at once dumped the entire current balance onto the
    oldest of them and left the later ones with nothing left to sweep."""
    balance = _account_balance(conn, account_id)
    cutoff = cutoff_date.isoformat()
    for r in conn.execute("SELECT type, amount FROM transactions WHERE account_id = ? AND date > ?", (account_id, cutoff)):
        balance -= r["amount"] if r["type"] == "Income" else -r["amount"]
    for r in conn.execute(
        "SELECT amount FROM transactions WHERE to_account_id = ? AND type = 'Transfer internal' AND date > ?",
        (account_id, cutoff),
    ):
        balance -= r["amount"]
    return balance


def _amortized_payment(principal, monthly_rate, n):
    """Standard level-payment amortization formula. n = number of payments
    remaining. Falls back to a plain split for a 0% loan (avoids /0)."""
    if n <= 0:
        return principal
    if monthly_rate == 0:
        return principal / n
    factor = (1 + monthly_rate) ** n
    return principal * monthly_rate * factor / (factor - 1)


def _months_between(from_date, to_date):
    """Inclusive month count from from_date's month to to_date's month."""
    return (to_date.year - from_date.year) * 12 + (to_date.month - from_date.month) + 1


def generate_due(conn, today=None):
    """Materialize every occurrence due (up to today, or the rule's
    end_date if earlier) for every active rule. Idempotent — safe to call
    on every request. `today` defaults to the real date; the override
    exists for deterministic testing of multi-cycle schedules."""
    if today is None:
        today = date.today()
    rules = [dict(r) for r in conn.execute("SELECT * FROM recurring_rules WHERE active = 1")]
    for rule in rules:
        ceiling = today
        if rule['end_date']:
            end = date.fromisoformat(rule['end_date'])
            if end < ceiling:
                ceiling = end
        after = date.fromisoformat(rule['last_generated_date']) if rule['last_generated_date'] else None
        while True:
            occ = next_occurrence(rule, after)
            if occ is None or occ > ceiling:
                break
            if rule['amount_mode'] == 'full_balance':
                # A credit-card autopay: sweep whatever was owed as of this
                # cycle's own due date (a running balance, not a
                # billing-cycle snapshot — see the plan notes), reconstructed
                # rather than read off today's figure so that catching up
                # several missed cycles at once attributes each one its own
                # correct amount instead of dumping everything onto the
                # oldest. Nothing owed -> nothing to generate, but the
                # schedule still advances so we don't re-check the same date
                # forever.
                owed = -_account_balance_asof(conn, rule['to_account_id'], occ)
                amount = round(owed, 2) if owed > 0 else 0
                if amount:
                    conn.execute(
                        "INSERT INTO transactions (date, account_id, to_account_id, type, category_id, amount, note, recurring_id) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (occ.isoformat(), rule['account_id'], rule['to_account_id'], rule['type'],
                         rule['category_id'], amount, rule['note'], rule['id']),
                    )
            elif rule['amount_mode'] == 'amortized':
                # A loan payment: the outstanding principal *is* the linked
                # loan account's balance (negated) — never a separately
                # tracked number, so a manually-recorded prepayment (just a
                # Transfer internal into that account) is automatically
                # reflected here with no extra step. Nothing owed -> the
                # loan is paid off (possibly early, via a prepayment):
                # deactivate and stop generating for this rule entirely.
                principal = -_account_balance(conn, rule['to_account_id'])
                if principal <= 0.005:
                    conn.execute("UPDATE recurring_rules SET active = 0, last_generated_date = ? WHERE id = ?", (occ.isoformat(), rule['id']))
                    break
                monthly_rate = (rule['annual_rate'] or 0) / 12
                # Uses the actual (possibly weekend-shifted) occurrence date
                # for the remaining-term count; a payment landing right on a
                # month boundary due to a weekend shift could be off by one
                # cycle near the very end — harmless, the clamp below still
                # guarantees the loan reaches exactly zero.
                remaining_n = _months_between(occ, date.fromisoformat(rule['end_date']))
                payment = _amortized_payment(principal, monthly_rate, remaining_n)
                interest = round(principal * monthly_rate, 2)
                principal_amount = round(payment - interest, 2)
                if principal_amount > principal:
                    principal_amount = round(principal, 2)
                if interest > 0:
                    # A 0% loan (or the last cycle, rounded to nothing) has no
                    # interest to record — inserting a €0.00 "Loan interest"
                    # row anyway would just be clutter every single cycle,
                    # inflating that category's movement count for no reason.
                    conn.execute(
                        "INSERT INTO transactions (date, account_id, type, category_id, amount, note, recurring_id) "
                        "VALUES (?, ?, 'Expense', ?, ?, ?, ?)",
                        (occ.isoformat(), rule['account_id'], rule['category_id'], interest, 'Loan interest', rule['id']),
                    )
                conn.execute(
                    "INSERT INTO transactions (date, account_id, to_account_id, type, amount, note, recurring_id) "
                    "VALUES (?, ?, ?, 'Transfer internal', ?, ?, ?)",
                    (occ.isoformat(), rule['account_id'], rule['to_account_id'], principal_amount, 'Loan principal', rule['id']),
                )
            else:
                amount = rule['amount']
                if amount:
                    conn.execute(
                        "INSERT INTO transactions (date, account_id, to_account_id, type, category_id, amount, note, recurring_id) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (occ.isoformat(), rule['account_id'], rule['to_account_id'], rule['type'],
                         rule['category_id'], amount, rule['note'], rule['id']),
                    )
            conn.execute("UPDATE recurring_rules SET last_generated_date = ? WHERE id = ?", (occ.isoformat(), rule['id']))
            after = occ
        if rule['amount_mode'] == 'amortized':
            # The loop above only deactivates on an early payoff (found
            # mid-schedule, before the next occurrence). A loan that simply
            # reaches the end of its natural term needs the same check once
            # more here, since the final regular payment already zeroed the
            # balance but nothing inside the loop re-checked it afterwards.
            if -_account_balance(conn, rule['to_account_id']) <= 0.005:
                conn.execute("UPDATE recurring_rules SET active = 0 WHERE id = ?", (rule['id'],))
