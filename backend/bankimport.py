"""Staging and duplicate detection for bank-imported transactions.

Nothing in here writes to the ledger. Bank rows are normalised, fingerprinted
and parked in `import_staging` with a *suggestion* attached; the user decides
what actually becomes a transaction. That split is deliberate — an earlier
implementation of this feature matched on amount + account + a date window and
deleted 16 transactions, 12 of which were real (a salary payment, top-ups,
gifts). Round amounts repeat far too often for a machine to be trusted with
the final call, so the machine only ever proposes here.
"""

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timedelta

# Banks book the two sides of the same payment on different days, so any
# comparison between a bank row and something already in the ledger has to
# tolerate a few days' drift. Four days is the window a previous version of
# this feature settled on after running against real ABN AMRO/Fineco/Revolut
# data.
class StaleLinkError(Exception):
    """Raised when a row is to be linked to a transaction that has vanished."""


DATE_TOLERANCE_DAYS = 4

# Amounts are currency, so compare below half a cent rather than with ==.
AMOUNT_EPSILON = 0.005

# Only booked transactions are staged. A pending row changes its reference,
# its date and sometimes its amount when it settles, which makes it impossible
# to recognise as the same transaction afterwards.
BOOKED_STATUSES = ("BOOK", "BOOKED", None, "")

_PUNCT = re.compile(r"[^A-Z0-9 ]+")
_LONG_DIGITS = re.compile(r"\b\d{4,}\b")
_WS = re.compile(r"\s+")
# "PAYPAL *SPOTIFY", "SQ *COFFEE BAR", "SUMUP *BAKERY" — the payment processor
# prefix tells us nothing; the merchant after the star is the useful part.
_PROCESSOR = re.compile(r"^(PAYPAL|SQ|SUMUP|IZ|ZETTLE|IZETTLE|STRIPE)\s*\*\s*")


def normalize_counterparty(raw):
    """Reduce a counterparty label to something stable enough to key on.

    Card statements pad the merchant with terminal ids, city names, dates and
    card tails that vary between transactions, so the raw string is useless as
    a lookup key. This keeps the leading words of the merchant itself.
    """
    if not raw:
        return ""
    text = unicodedata.normalize("NFKD", str(raw))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper().strip()
    text = _PROCESSOR.sub("", text)
    text = _LONG_DIGITS.sub(" ", text)
    text = _PUNCT.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return " ".join(text.split()[:4])


def _norm_iban(raw):
    if not raw:
        return None
    return re.sub(r"[\s-]", "", str(raw)).upper() or None


def fingerprint(row, occurrence=0):
    """A stable identity for one bank transaction, scoped to its feed.

    Prefers the bank's own entry reference. When the bank does not supply one
    (several do not), falls back to a hash of the fields that identify the
    payment. Identical rows — the same coffee bought twice in one day for the
    same amount — hash the same, so they are disambiguated by their position
    within the group. Counting per hash rather than globally keeps that
    numbering stable across re-syncs.
    """
    ref = (row.get("entry_reference") or "").strip()
    if ref:
        base = "ref:" + ref
    else:
        parts = [
            row.get("booking_date") or "",
            "%.2f" % float(row.get("amount") or 0),
            row.get("direction") or "",
            (row.get("currency") or "").upper(),
            _norm_iban(row.get("counterparty_iban")) or normalize_counterparty(row.get("counterparty_name")),
            normalize_counterparty(row.get("remittance")),
        ]
        digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
        base = "h:" + digest[:32]
    if occurrence:
        base = "%s#%d" % (base, occurrence)
    return base


def assign_fingerprints(rows):
    """Fingerprint a batch, numbering collisions so genuine repeats survive."""
    seen = {}
    out = []
    for row in rows:
        base = fingerprint(row)
        n = seen.get(base, 0)
        seen[base] = n + 1
        out.append(fingerprint(row, n))
    return out


# ---------- own-account awareness ----------

def own_ibans(conn):
    """IBAN -> account id for the user's own accounts.

    This is what lets a transfer between two of the user's own banks be
    recognised as a transfer rather than booked as phantom income. A previous
    implementation needed a hand-maintained list of account ids in an env var
    for the same job; the IBANs the user already enters keep themselves up to
    date.
    """
    mapping = {}
    for r in conn.execute("SELECT id, iban FROM accounts WHERE iban IS NOT NULL"):
        iban = _norm_iban(r["iban"])
        if iban:
            mapping[iban] = r["id"]
    return mapping


# ---------- matching against transactions the user typed in ----------

def _tokens(*values):
    out = set()
    for v in values:
        for tok in normalize_counterparty(v).split():
            if len(tok) >= 4:
                out.add(tok)
    return out


def _is_round(amount):
    cents = round(abs(amount) * 100)
    return cents % 500 == 0


def find_match_candidates(conn, row, claimed_tx_ids):
    """Transactions already in the ledger that this bank row might duplicate.

    Every condition here is mandatory — a row that fails any of them is not a
    candidate at all. Scoring only ranks what survives; it never rescues a
    near-miss.
    """
    booking = date.fromisoformat(row["booking_date"])
    lo = (booking - timedelta(days=DATE_TOLERANCE_DAYS)).isoformat()
    hi = (booking + timedelta(days=DATE_TOLERANCE_DAYS)).isoformat()
    account_id = row["account_id"]
    amount = float(row["amount"])

    if row["direction"] == "out":
        sql = (
            "SELECT * FROM transactions WHERE external_id IS NULL "
            "AND date BETWEEN ? AND ? AND ABS(amount - ?) < ? "
            "AND account_id = ? AND type IN ('Expense', 'Transfer internal', 'Transfer external')"
        )
        params = (lo, hi, amount, AMOUNT_EPSILON, account_id)
    else:
        sql = (
            "SELECT * FROM transactions WHERE external_id IS NULL "
            "AND date BETWEEN ? AND ? AND ABS(amount - ?) < ? "
            "AND ((account_id = ? AND type = 'Income') "
            "     OR (to_account_id = ? AND type = 'Transfer internal'))"
        )
        params = (lo, hi, amount, AMOUNT_EPSILON, account_id, account_id)

    rows = [dict(r) for r in conn.execute(sql, params)]
    return [r for r in rows if r["id"] not in claimed_tx_ids]


def score_match(row, candidate):
    """Rank a candidate and explain the ranking in words the user can judge.

    The score is presentation only. It decides how prominently a suggestion is
    shown, never whether it is applied.
    """
    score = 0.0
    reasons = []

    delta = abs((date.fromisoformat(row["booking_date"]) - date.fromisoformat(candidate["date"])).days)
    if delta == 0:
        score += 3
        reasons.append("same day")
    elif delta == 1:
        score += 2
        reasons.append("1 day apart")
    else:
        score += max(0, 3 - delta) * 0.5
        reasons.append("%d days apart" % delta)

    overlap = _tokens(row.get("counterparty_name"), row.get("remittance")) & _tokens(candidate.get("note"))
    if overlap:
        score += 3
        reasons.append("description mentions " + ", ".join(sorted(overlap)[:2]))

    if not _is_round(float(row["amount"])):
        score += 2
        reasons.append("unusual amount")
    else:
        reasons.append("round amount, which repeats often")

    return score, "; ".join(reasons)


def attach_match(conn, row, claimed_tx_ids):
    """Attach the best duplicate suggestion, if any, to a staged row.

    Ambiguity is reported rather than resolved: when several ledger entries fit
    equally well the suggestion is deliberately weakened, because picking one
    of them arbitrarily is how the earlier version destroyed real data.
    """
    candidates = find_match_candidates(conn, row, claimed_tx_ids)
    if not candidates:
        return None, None, None

    scored = sorted(
        ((score_match(row, c), c) for c in candidates),
        key=lambda pair: pair[0][0],
        reverse=True,
    )
    (best_score, best_reason), best = scored[0]

    if len(scored) > 1:
        best_score -= 2
        best_reason += "; %d other entries also fit" % (len(scored) - 1)

    return best["id"], round(best_score, 2), best_reason


# ---------- transfers between the user's own accounts ----------

def classify_transfer(row, ibans):
    """Suggest a movement type for a bank row.

    When the counterparty is one of the user's own IBANs the money did not
    leave their control, so it is a transfer rather than income or spending.
    Matching on IBAN is safe; matching on a counterparty *name* is not, and is
    left alone here.
    """
    cp = _norm_iban(row.get("counterparty_iban"))
    if cp and cp in ibans:
        other = ibans[cp]
        if other != row["account_id"]:
            return "Transfer internal", other
    return ("Income" if row["direction"] == "in" else "Expense"), None


def movement_type(row):
    """What a staged row will actually become, from its two sides.

    Derived rather than stored so the page and the commit can never disagree:
    money moving between two accounts the user owns is an internal transfer,
    and the moment either side stops being one of theirs it is not, whatever
    was proposed earlier.
    """
    src, dst = row.get("from_account_id"), row.get("to_account_id")
    if src and dst and src != dst:
        return "Transfer internal"
    stored = row.get("tx_type")
    if stored == "Transfer external":
        return stored
    return "Income" if row.get("direction") == "in" else "Expense"


def pair_two_sided(staged, ibans):
    """Find rows that are two banks reporting the same transfer.

    Both banks report a transfer between the user's own accounts — one as
    money leaving, the other as money arriving — so importing both would move
    the amount twice. They only count as a pair when each side names the other
    side's account and the two rows come from different feeds; two rows from
    one feed are two real transactions.
    """
    pairs = {}
    used = set()
    outs = [r for r in staged if r["direction"] == "out"]
    ins = [r for r in staged if r["direction"] == "in"]

    for a in outs:
        if a["id"] in used:
            continue
        a_iban = _norm_iban(a.get("counterparty_iban"))
        for b in ins:
            if b["id"] in used or b["feed_uuid"] == a["feed_uuid"]:
                continue
            if abs(float(a["amount"]) - float(b["amount"])) >= AMOUNT_EPSILON:
                continue
            delta = abs(
                (date.fromisoformat(a["booking_date"]) - date.fromisoformat(b["booking_date"])).days
            )
            if delta > DATE_TOLERANCE_DAYS:
                continue
            b_iban = _norm_iban(b.get("counterparty_iban"))
            # each side has to name the other's account for this to be the
            # same payment rather than a coincidence of amount and date
            a_names_b = a_iban is not None and ibans.get(a_iban) == b["account_id"]
            b_names_a = b_iban is not None and ibans.get(b_iban) == a["account_id"]
            if not (a_names_b or b_names_a):
                continue
            pairs[a["id"]] = b["id"]
            pairs[b["id"]] = a["id"]
            used.add(a["id"])
            used.add(b["id"])
            break
    return pairs


# ---------- counterparty memory ----------

def payee_key(row):
    """The key a categorisation is remembered under: IBAN when we have one."""
    cp = _norm_iban(row.get("counterparty_iban"))
    if cp:
        return "iban", cp
    name = normalize_counterparty(row.get("counterparty_name")) or normalize_counterparty(row.get("remittance"))
    return ("name", name) if name else (None, None)


def lookup_payee_rule(conn, row):
    kind, value = payee_key(row)
    if not kind:
        return None
    hit = conn.execute(
        "SELECT category_id, tx_type FROM payee_rules WHERE match_kind = ? AND match_value = ?",
        (kind, value),
    ).fetchone()
    return dict(hit) if hit else None


def remember_payee(conn, row, category_id, tx_type):
    """Record how the user categorised this counterparty, for next time."""
    kind, value = payee_key(row)
    if not kind or category_id is None:
        return
    conn.execute(
        "INSERT INTO payee_rules (match_kind, match_value, category_id, tx_type, hits, updated_at) "
        "VALUES (?, ?, ?, ?, 1, ?) "
        "ON CONFLICT(match_kind, match_value) DO UPDATE SET "
        "category_id = excluded.category_id, tx_type = excluded.tx_type, "
        "hits = hits + 1, updated_at = excluded.updated_at",
        (kind, value, category_id, tx_type, datetime.utcnow().isoformat()),
    )


# ---------- staging ----------

def stage_rows(conn, rows):
    """Park normalised bank rows in the review queue.

    Returns counts rather than the rows themselves; the page reloads the queue
    afterwards. Anything already decided or already queued is silently passed
    over, which is what makes re-running a sync harmless.
    """
    feeds = {r["uuid"]: dict(r) for r in conn.execute("SELECT * FROM bank_feeds")}
    ibans = own_ibans(conn)
    now = datetime.utcnow().isoformat()

    added = skipped_known = skipped_unmapped = skipped_pending = skipped_currency = 0
    fingerprints = assign_fingerprints(rows)
    claimed = set()

    for row, fp in zip(rows, fingerprints):
        feed = feeds.get(row.get("feed_uuid"))
        if not feed or not feed.get("account_id") or not feed.get("sync_enabled"):
            skipped_unmapped += 1
            continue
        status = (row.get("status") or "").upper() or None
        if status not in BOOKED_STATUSES:
            skipped_pending += 1
            continue
        # The ledger stores no currency, so a row denominated in something
        # other than the account's own currency would be booked as if the
        # number meant euros. Refuse it rather than quietly get it wrong.
        row_ccy = (row.get("currency") or "").upper()
        feed_ccy = (feed.get("currency") or "").upper()
        if row_ccy and feed_ccy and row_ccy != feed_ccy:
            skipped_currency += 1
            continue

        decided = conn.execute(
            "SELECT 1 FROM import_ledger WHERE feed_uuid = ? AND fingerprint = ?",
            (row["feed_uuid"], fp),
        ).fetchone()
        already = conn.execute(
            "SELECT 1 FROM import_staging WHERE feed_uuid = ? AND fingerprint = ?",
            (row["feed_uuid"], fp),
        ).fetchone()
        if decided or already:
            skipped_known += 1
            continue

        enriched = dict(row)
        enriched["account_id"] = feed["account_id"]
        tx_type, other = classify_transfer(enriched, ibans)
        # The feed's own account always sits on the side the money moved; the
        # other side is filled in only when the bank named an IBAN we
        # recognise. Left NULL it simply means "not one of mine", which the
        # user can correct on the review page.
        if row["direction"] == "out":
            from_account, to_account = feed["account_id"], other
        else:
            from_account, to_account = other, feed["account_id"]
        rule = lookup_payee_rule(conn, enriched)
        category_id = rule["category_id"] if rule and tx_type in ("Expense", "Income") else None
        match_tx_id, match_score, match_reason = attach_match(conn, enriched, claimed)
        if match_tx_id:
            claimed.add(match_tx_id)

        conn.execute(
            "INSERT INTO import_staging (feed_uuid, account_id, fingerprint, booking_date, value_date, "
            "amount, direction, currency, counterparty_name, counterparty_iban, remittance, raw_json, "
            "fetched_at, tx_type, category_id, from_account_id, to_account_id, note, match_tx_id, "
            "match_score, match_reason) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["feed_uuid"], feed["account_id"], fp, row["booking_date"], row.get("value_date"),
                abs(float(row["amount"])), row["direction"], row.get("currency"),
                row.get("counterparty_name"), _norm_iban(row.get("counterparty_iban")), row.get("remittance"),
                json.dumps(row.get("raw") or {}), now, tx_type, category_id, from_account, to_account,
                row.get("remittance") or row.get("counterparty_name"),
                match_tx_id, match_score, match_reason,
            ),
        )
        added += 1

    _repair_pairs(conn, ibans)
    return {
        "added": added,
        "already_known": skipped_known,
        "unmapped": skipped_unmapped,
        "pending": skipped_pending,
        "wrong_currency": skipped_currency,
    }


def refresh_matches(conn):
    """Recompute duplicate suggestions for everything still awaiting review.

    A queue can sit for days while the user keeps entering transactions by
    hand, so a suggestion worked out at fetch time goes stale — including the
    case that matters most, where the user types in the very transaction a
    staged row represents. Recomputing on every read keeps the suggestion a
    function of what the ledger actually contains right now. Rows the user has
    already decided on are left alone.
    """
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM import_staging WHERE decision = 'pending' ORDER BY booking_date, id"
    )]
    claimed = set()
    for row in rows:
        match_tx_id, match_score, match_reason = attach_match(conn, row, claimed)
        if match_tx_id:
            claimed.add(match_tx_id)
        if (row["match_tx_id"], row["match_score"], row["match_reason"]) != (match_tx_id, match_score, match_reason):
            conn.execute(
                "UPDATE import_staging SET match_tx_id = ?, match_score = ?, match_reason = ? WHERE id = ?",
                (match_tx_id, match_score, match_reason, row["id"]),
            )
    _repair_pairs(conn, own_ibans(conn))


def _repair_pairs(conn, ibans):
    """Recompute two-sided transfer pairing across the whole pending queue."""
    staged = [dict(r) for r in conn.execute("SELECT * FROM import_staging WHERE decision = 'pending'")]
    pairs = pair_two_sided(staged, ibans)
    for row in staged:
        want = pairs.get(row["id"])
        if row["pair_id"] != want:
            conn.execute("UPDATE import_staging SET pair_id = ? WHERE id = ?", (want, row["id"]))


# ---------- committing ----------

def commit_staged(conn):
    """Turn reviewed rows into real transactions, atomically.

    Only rows the user explicitly marked are touched; anything still pending
    stays in the queue. Each committed row leaves a permanent trace in
    import_ledger whether it became a transaction, was linked to one the user
    had already entered, or was rejected outright.
    """
    now = datetime.utcnow().isoformat()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM import_staging WHERE decision IN ('import', 'skip', 'link') ORDER BY booking_date, id"
    )]

    imported = linked = skipped = 0
    handled = set()

    for row in rows:
        if row["id"] in handled:
            continue
        external_id = "%s|%s" % (row["feed_uuid"], row["fingerprint"])

        if row["decision"] == "skip":
            _record(conn, row, "skipped", None, now)
            skipped += 1
            handled.add(row["id"])
            continue

        if row["decision"] == "link":
            # The user already entered this one by hand. Stamp their entry with
            # the bank's identity so it is recognised on the next sync instead
            # of being offered again.
            #
            # If the entry has since been deleted, refuse the whole commit.
            # Recording the link anyway would tombstone this bank transaction
            # as handled while nothing in the ledger represents it — money
            # silently missing, which is far worse than a visible error.
            updated = conn.execute(
                "UPDATE transactions SET external_id = ? WHERE id = ? AND external_id IS NULL",
                (external_id, row["match_tx_id"]),
            ).rowcount
            if not updated:
                raise StaleLinkError(
                    "The transaction one of these rows was to be linked to no longer exists "
                    "or is already linked. Review the queue again."
                )
            _record(conn, row, "linked", row["match_tx_id"], now)
            linked += 1
            handled.add(row["id"])
            continue

        partner = None
        if row["pair_id"]:
            partner = next((r for r in rows if r["id"] == row["pair_id"] and r["decision"] == "import"), None)
            if partner is None:
                # The partner wasn't decided in this batch — it may still be
                # sitting untouched in the queue. Pairing is established
                # through mandatory gates (matching IBANs, opposite
                # direction, equal amount), not the soft scoring this queue
                # otherwise refuses to resolve on its own, so it is already
                # certain rather than merely suggested — the row's own
                # pairNote already promises "it will be imported once".
                # Leaving the partner queued here would silently break that
                # promise: once this row's transaction exists, the partner's
                # external_id-based duplicate check can no longer see it
                # (find_match_candidates excludes already-linked
                # transactions on purpose), so the partner would resurface
                # as if unmatched and could be imported a second time.
                live = conn.execute(
                    "SELECT * FROM import_staging WHERE id = ? AND decision = 'pending'",
                    (row["pair_id"],),
                ).fetchone()
                partner = dict(live) if live else None
                if partner is not None:
                    conn.execute("DELETE FROM import_staging WHERE id = ?", (partner["id"],))

        if partner is not None:
            # Two banks reporting one transfer: book it once, from the side the
            # money left towards the side it arrived on.
            out_row = row if row["direction"] == "out" else partner
            in_row = partner if row["direction"] == "out" else row
            tx_id = _insert(
                conn, out_row["booking_date"], out_row["account_id"], in_row["account_id"],
                "Transfer internal", None, out_row["amount"], out_row["note"], external_id,
            )
            _record(conn, out_row, "imported", tx_id, now)
            _record(conn, in_row, "linked", tx_id, now)
            handled.add(out_row["id"])
            handled.add(in_row["id"])
            imported += 1
            linked += 1
            continue

        tx_type = movement_type(row)
        if tx_type == "Transfer internal":
            account_id, to_account = row["from_account_id"], row["to_account_id"]
        else:
            # Whichever side is one of the user's own accounts carries the
            # movement; the other side is a counterparty the ledger does not
            # model. Falling back to account_id keeps rows staged before the
            # two sides existed working unchanged.
            owned = row["to_account_id"] if row["direction"] == "in" else row["from_account_id"]
            account_id, to_account = owned or row["account_id"], None
        tx_id = _insert(
            conn, row["booking_date"], account_id, to_account, tx_type,
            row["category_id"] if tx_type in ("Expense", "Income") else None,
            row["amount"], row["note"], external_id,
        )
        if row["category_id"] and tx_type in ("Expense", "Income"):
            remember_payee(conn, row, row["category_id"], tx_type)
        _record(conn, row, "imported", tx_id, now)
        handled.add(row["id"])
        imported += 1

    conn.execute("DELETE FROM import_staging WHERE decision IN ('import', 'skip', 'link')")
    return {"imported": imported, "linked": linked, "skipped": skipped}


def _insert(conn, when, account_id, to_account_id, tx_type, category_id, amount, note, external_id):
    cur = conn.execute(
        "INSERT INTO transactions (date, account_id, to_account_id, type, category_id, amount, note, external_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (when, account_id, to_account_id, tx_type, category_id, abs(float(amount)), note, external_id),
    )
    return cur.lastrowid


def _record(conn, row, outcome, tx_id, when):
    conn.execute(
        "INSERT INTO import_ledger (feed_uuid, fingerprint, outcome, transaction_id, decided_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(feed_uuid, fingerprint) DO UPDATE SET "
        "outcome = excluded.outcome, transaction_id = excluded.transaction_id, decided_at = excluded.decided_at",
        (row["feed_uuid"], row["fingerprint"], outcome, tx_id, when),
    )
