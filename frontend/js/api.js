import { state } from './state.js';
import { render } from './render.js';

export async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (res.status === 401) { state.authed = false; render(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

export async function loadAll() {
  const [accounts, cats, budgetRows, tx, recurring, staged, feeds, bank] = await Promise.all([
    api('/api/accounts'), api('/api/categories'), api('/api/budgets'), api('/api/transactions'), api('/api/recurring'),
    // Reloading the queue alongside everything else is what keeps its
    // duplicate suggestions honest: entering a movement by hand re-runs the
    // match against what the ledger now holds.
    api('/api/import/staged'), api('/api/import/feeds'), api('/api/bank/status')
  ]);
  state.accounts = accounts;
  state.cats = cats;
  state.budgets = {};
  budgetRows.forEach(b => { state.budgets[b.category_id] = b.monthly_limit; });
  // 'T00:00:00' forces local-midnight parsing. A bare date string ("2026-08-31")
  // parses as UTC midnight per ECMA-262, which in a UTC+1/+2 timezone lands an
  // hour or two into local Sept 1 — one hour past the period boundary below
  // (built with new Date(y, m, d), local by construction) — silently dropping
  // last-day-of-period transactions from every period-scoped view.
  state.tx = tx.map(t => Object.assign({}, t, { _date: new Date(t.date + 'T00:00:00') }));
  state.recurring = recurring;
  // Defensive: an import page that renders empty is a far better failure than
  // one that takes the whole app down, and these two are the only collections
  // served by endpoints a stale cached build might not know about.
  state.staged = Array.isArray(staged) ? staged : [];
  state.feeds = feeds && Array.isArray(feeds.feeds) ? feeds.feeds : [];
  state.connections = feeds && Array.isArray(feeds.connections) ? feeds.connections : [];
  state.bank = bank && typeof bank === 'object' && 'configured' in bank
    ? bank : { configured: false, connections: [], redirect_url: '', config: null, suggested_redirect_url: '', redirect_url_mismatch: false };
  if (!state.form.account && accounts.length) state.form.account = accounts[0].id;
}
