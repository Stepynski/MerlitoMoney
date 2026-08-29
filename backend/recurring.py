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


def generate_due(conn):
    """Materialize every occurrence due (up to today, or the rule's
    end_date if earlier) for every active rule. Idempotent — safe to call
    on every request."""
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
            conn.execute(
                "INSERT INTO transactions (date, account_id, to_account_id, type, category_id, amount, note, recurring_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (occ.isoformat(), rule['account_id'], rule['to_account_id'], rule['type'],
                 rule['category_id'], rule['amount'], rule['note'], rule['id']),
            )
            conn.execute("UPDATE recurring_rules SET last_generated_date = ? WHERE id = ?", (occ.isoformat(), rule['id']))
            after = occ
