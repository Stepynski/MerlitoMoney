import { state } from './state.js';
import { api, loadAll } from './api.js';
import { render } from './render.js';
import { num, unbudgeted, acct } from './viewmodel.js';
import { PAL } from './constants.js';

// ---------- mutations (call the API, then reload + render) ----------
export async function submit() {
  const f = state.form;
  if ((state.modal === 'movement' || state.modal === 'recurring') && !num(f.amount)) { state.modal = null; state.formError = ''; render(); return; }
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
    const editing = acct(state.editId);
    const body = {
      name: f.name.trim() || 'New account',
      type: isSave ? 'Savings' : f.type,
      icon: isSave ? 'ic-piggy' : (f.type === 'Cash' ? 'ic-cash' : f.type === 'Wallet' ? 'ic-wallet' : 'ic-bank'),
      color: isSave ? '#40c057' : (editing ? editing.color : PAL[state.accounts.length % PAL.length]),
      grp: isSave ? 'save' : 'spend',
      starting_balance: num(f.balance),
      goal_amount: isSave && num(f.goal) > 0 ? num(f.goal) : null,
      iban: f.iban ? f.iban.trim() : null
    };
    if (editing) {
      await api('/api/accounts/' + editing.id, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
    }
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
      amount: num(f.amount),
      note: f.note && f.note.trim() ? f.note.trim() : null
    };
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
    state.page = 'balance';
  } else if (state.modal === 'recurring') {
    const isTransfer = f.recurMovement === 'Transfer internal';
    const body = {
      name: f.name.trim() || 'New recurring',
      type: f.recurMovement,
      account_id: f.account,
      to_account_id: isTransfer && f.toAccount ? f.toAccount : null,
      category_id: (f.recurMovement === 'Expense' || f.recurMovement === 'Income') ? (f.category || null) : null,
      amount: num(f.amount),
      note: f.note && f.note.trim() ? f.note.trim() : null,
      freq: f.freq,
      interval_n: Math.max(1, parseInt(f.intervalN, 10) || 1),
      weekday: f.freq === 'weekly' ? parseInt(f.weekday, 10) : null,
      day_of_month: (f.freq === 'monthly' || f.freq === 'yearly') ? parseInt(f.dayOfMonth, 10) : null,
      month_of_year: f.freq === 'yearly' ? parseInt(f.monthOfYear, 10) : null,
      nth_business_day: f.freq === 'monthly_nth_business_day' ? parseInt(f.nthBusinessDay, 10) : null,
      weekend_rule: f.freq === 'monthly_nth_business_day' ? 'none' : f.weekendRule,
      start_date: f.startDate,
      end_date: f.noEnd ? null : (f.endDate || null)
    };
    if (state.editId) {
      await api('/api/recurring/' + state.editId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/api/recurring', { method: 'POST', body: JSON.stringify(body) });
    }
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
export async function closeAccountAction() {
  await api('/api/accounts/' + state.editId, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  state.modal = null;
  await loadAll();
  render();
}
export async function deleteAccountAction() {
  await api('/api/accounts/' + state.editId, { method: 'DELETE' });
  state.modal = null;
  await loadAll();
  render();
}
export async function reopenAccount(id) {
  await api('/api/accounts/' + id, { method: 'PATCH', body: JSON.stringify({ active: true }) });
  await loadAll();
  render();
}
export async function pauseRecurringAction() {
  await api('/api/recurring/' + state.editId, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  state.modal = null;
  await loadAll();
  render();
}
export async function resumeRecurringAction() {
  await api('/api/recurring/' + state.editId, { method: 'PATCH', body: JSON.stringify({ active: true }) });
  state.modal = null;
  await loadAll();
  render();
}
export async function deleteRecurringAction() {
  await api('/api/recurring/' + state.editId, { method: 'DELETE' });
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
