import { state } from './state.js';
import { render } from './render.js';

export async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (res.status === 401) { state.authed = false; render(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

export async function loadAll() {
  const [accounts, cats, budgetRows, tx, recurring, staged, feeds] = await Promise.all([
    api('/api/accounts'), api('/api/categories'), api('/api/budgets'), api('/api/transactions'), api('/api/recurring'),
    // Reloading the queue alongside everything else is what keeps its
    // duplicate suggestions honest: entering a movement by hand re-runs the
    // match against what the ledger now holds.
    api('/api/import/staged'), api('/api/import/feeds')
  ]);
  state.accounts = accounts;
  state.cats = cats;
  state.budgets = {};
  budgetRows.forEach(b => { state.budgets[b.category_id] = b.monthly_limit; });
  state.tx = tx.map(t => Object.assign({}, t, { _date: new Date(t.date) }));
  state.recurring = recurring;
  // Defensive: an import page that renders empty is a far better failure than
  // one that takes the whole app down, and these two are the only collections
  // served by endpoints a stale cached build might not know about.
  state.staged = Array.isArray(staged) ? staged : [];
  state.feeds = feeds && Array.isArray(feeds.feeds) ? feeds.feeds : [];
  state.connections = feeds && Array.isArray(feeds.connections) ? feeds.connections : [];
  if (!state.form.account && accounts.length) state.form.account = accounts[0].id;
}
