import { state } from './state.js';
import { api, loadAll } from './api.js';
import { render } from './render.js';
import { num, unbudgeted } from './viewmodel.js';
import { PAL } from './constants.js';

// ---------- mutations (call the API, then reload + render) ----------
export async function submit() {
  const f = state.form;
  if (state.modal === 'movement' && !num(f.amount)) { state.modal = null; state.formError = ''; render(); return; }
  try {
    await submitModal(f);
  } catch (e) {
    state.formError = e.message || 'Something went wrong';
    render();
    return;
  }
  state.modal = null;
  state.formError = '';
  await loadAll();
  render();
}
export async function submitModal(f) {
  if (state.modal === 'account') {
    const isSave = f.kind === 'save';
    const body = {
      name: f.name.trim() || 'New account',
      type: isSave ? 'Savings' : f.type,
      icon: isSave ? 'ic-piggy' : (f.type === 'Cash' ? 'ic-cash' : f.type === 'Wallet' ? 'ic-wallet' : 'ic-bank'),
      color: isSave ? '#40c057' : PAL[state.accounts.length % PAL.length],
      grp: isSave ? 'save' : 'spend',
      starting_balance: num(f.balance),
      goal_amount: isSave && num(f.goal) > 0 ? num(f.goal) : null,
      iban: f.iban ? f.iban.trim() : null
    };
    await api('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
  } else if (state.modal === 'budget') {
    const id = f.category || ((unbudgeted()[0] || {}).id);
    if (id) await api('/api/budgets', { method: 'POST', body: JSON.stringify({ category_id: id, monthly_limit: num(f.limit) || 100 }) });
  } else if (state.modal === 'category') {
    if (state.editId) {
      await api('/api/categories/' + state.editId, { method: 'PATCH', body: JSON.stringify({ name: f.name.trim() || undefined, icon: f.icon, color: f.color }) });
    } else {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name: f.name.trim() || 'New category', kind: f.kind === 'income' ? 'income' : 'expense', icon: f.icon, color: f.color }) });
    }
  } else if (state.modal === 'movement') {
    const isTransfer = f.movement === 'Transfer internal';
    const body = {
      date: new Date().toISOString().slice(0, 10),
      account_id: f.account,
      to_account_id: isTransfer && f.toAccount ? f.toAccount : null,
      type: f.movement,
      category_id: (f.movement === 'Expense' || f.movement === 'Income') ? (f.category || null) : null,
      amount: num(f.amount)
    };
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
    state.page = 'balance';
  }
}
export async function deleteCategoryAction() {
  await api('/api/categories/' + state.editId, { method: 'DELETE' });
  state.modal = null;
  await loadAll();
  render();
}
export async function removeBudgetAction() {
  await api('/api/budgets/' + state.editId, { method: 'DELETE' });
  state.modal = null;
  await loadAll();
  render();
}
export async function logoutAction() {
  await api('/api/logout', { method: 'POST' });
  state.authed = false;
  state.modal = null; state.drawerOpen = false;
  render();
}
