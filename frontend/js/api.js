import { state } from './state.js';
import { render } from './render.js';

export async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (res.status === 401) { state.authed = false; render(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

export async function loadAll() {
  const [accounts, cats, budgetRows, tx] = await Promise.all([
    api('/api/accounts'), api('/api/categories'), api('/api/budgets'), api('/api/transactions')
  ]);
  state.accounts = accounts;
  state.cats = cats;
  state.budgets = {};
  budgetRows.forEach(b => { state.budgets[b.category_id] = b.monthly_limit; });
  state.tx = tx.map(t => Object.assign({}, t, { _date: new Date(t.date) }));
  if (!state.form.account && accounts.length) state.form.account = accounts[0].id;
}
