import { state } from './state.js';
import { api, loadAll } from './api.js';
import { render } from './render.js';
import { num, unbudgeted, acct, openModal } from './viewmodel.js';
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
    const isCredit = f.kind === 'credit';
    const isLoan = f.kind === 'loan';
    const editing = acct(state.editId);
    const wasCredit = editing && editing.grp === 'credit';
    const body = {
      name: f.name.trim() || 'New account',
      type: isSave ? 'Savings' : isCredit ? 'Credit card' : isLoan ? 'Loan' : f.type,
      icon: isSave ? 'ic-piggy' : isCredit ? 'ic-card' : isLoan ? 'ic-bank' : (f.type === 'Cash' ? 'ic-cash' : f.type === 'Wallet' ? 'ic-wallet' : 'ic-bank'),
      color: isSave ? '#40c057' : isCredit ? '#e03b34' : isLoan ? '#e8890c' : (editing ? editing.color : PAL[state.accounts.length % PAL.length]),
      grp: isSave ? 'save' : isCredit ? 'credit' : isLoan ? 'loan' : 'spend',
      starting_balance: (isCredit || isLoan) ? -Math.abs(num(f.balance)) : num(f.balance),
      goal_amount: (isSave || isCredit || isLoan) && num(f.goal) > 0 ? num(f.goal) : null,
      iban: f.iban ? f.iban.trim() : null
    };
    let accountId = editing ? editing.id : null;
    if (editing) {
      await api('/api/accounts/' + editing.id, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      const created = await api('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
      accountId = created.id;
    }
    if (accountId && (isCredit || wasCredit)) {
      const enabled = isCredit && !!f.autopayEnabled && !!f.autopayFrom;
      await api('/api/accounts/' + accountId + '/autopay', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          from_account_id: enabled ? f.autopayFrom : null,
          day_of_month: enabled ? parseInt(f.autopayDay, 10) : null,
          weekend_rule: f.autopayWeekendRule || 'none'
        })
      });
    }
    if (accountId && isLoan) {
      if (!f.loanFrom || !num(f.loanRate) && f.loanRate !== '0' || !parseInt(f.loanTermMonths, 10)) {
        throw new Error('A loan needs a funding account, interest rate, and remaining term to set up its schedule');
      }
      await api('/api/accounts/' + accountId + '/loan', {
        method: 'PUT',
        body: JSON.stringify({
          from_account_id: f.loanFrom,
          annual_rate: num(f.loanRate) / 100,
          term_months: parseInt(f.loanTermMonths, 10),
          category_id: f.loanCategory || null,
          day_of_month: parseInt(f.loanDay, 10),
          weekend_rule: f.loanWeekendRule || 'none'
        })
      });
    }
  } else if (state.modal === 'extraPayment') {
    // Just a normal Transfer internal to the loan account (state.editId) —
    // identical in every way to creating one via the regular "New movement"
    // flow, so it doesn't depend on a recurring rule existing at all (that
    // was an unnecessary indirection that could fail even though the
    // payment itself needs nothing but the two account ids and an amount).
    if (!f.extraPaymentFrom) throw new Error('Choose which account to pay from');
    if (!num(f.extraPaymentAmount)) throw new Error('Enter an amount');
    await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: f.extraPaymentDate, account_id: f.extraPaymentFrom, to_account_id: state.editId,
        type: 'Transfer internal', amount: num(f.extraPaymentAmount), note: 'Extra loan payment'
      })
    });
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
      account_id: f.account,
      to_account_id: isTransfer && f.toAccount ? f.toAccount : null,
      type: f.movement,
      category_id: (f.movement === 'Expense' || f.movement === 'Income') ? (f.category || null) : null,
      amount: num(f.amount),
      note: f.note && f.note.trim() ? f.note.trim() : null
    };
    if (state.editId) {
      await api('/api/transactions/' + state.editId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      body.date = new Date().toISOString().slice(0, 10);
      await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
    }
    state.page = 'balance'; state.balanceTab = 'movements';
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
export async function toggleNetWorthAction(a) {
  await api('/api/accounts/' + a.id, { method: 'PATCH', body: JSON.stringify({ include_in_net_worth: !a.include_in_net_worth }) });
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
export async function deleteMovementAction() {
  await api('/api/transactions/' + state.editId, { method: 'DELETE' });
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
export async function deleteAllDataAction() {
  if (state.form.dangerConfirm !== 'DELETE') { state.formError = 'Type DELETE to confirm'; render(); return; }
  try {
    await api('/api/danger/delete-all', { method: 'POST', body: JSON.stringify({ password: state.form.dangerPassword }) });
  } catch (e) {
    state.formError = 'Wrong password'; render(); return;
  }
  state.modal = null; state.formError = '';
  await loadAll();
  state.page = 'overview';
  render();
}
export async function changePasswordAction() {
  const f = state.form;
  if (f.newPassword.length < 4) { state.formError = 'New password must be at least 4 characters'; render(); return; }
  if (f.newPassword !== f.confirmNewPassword) { state.formError = 'Passwords do not match'; render(); return; }
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ current_password: f.currentPassword, new_password: f.newPassword }) });
  } catch (e) {
    state.formError = 'Current password is incorrect'; render(); return;
  }
  state.modal = null; state.formError = '';
  render();
}
export function downloadTransactionsCsv() {
  window.location.href = '/api/export/transactions.csv';
}
export function downloadBackup() {
  window.location.href = '/api/backup/export';
}
export function pickBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.form.backupFileData = JSON.parse(reader.result);
      state.form.backupFileName = file.name;
      state.formError = '';
    } catch (e) {
      state.form.backupFileData = null;
      state.form.backupFileName = '';
      state.formError = 'That file is not valid JSON';
    }
    render();
  };
  reader.readAsText(file);
}
export async function restoreBackupAction() {
  const f = state.form;
  if (!f.backupFileData) { state.formError = 'Choose a backup file first'; render(); return; }
  if (f.backupConfirm !== 'RESTORE') { state.formError = 'Type RESTORE to confirm'; render(); return; }
  try {
    await api('/api/backup/import', { method: 'POST', body: JSON.stringify({ password: f.backupPassword, data: f.backupFileData }) });
  } catch (e) {
    try { state.formError = JSON.parse(e.message).detail; } catch (_) { state.formError = 'Restore failed'; }
    render();
    return;
  }
  state.modal = null; state.formError = '';
  await loadAll();
  state.page = 'overview';
  render();
}
export async function refreshSwStatus() {
  const info = { supported: 'serviceWorker' in navigator, registered: false };
  if (info.supported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        info.registered = true;
        info.state = (reg.active && reg.active.state) || (reg.installing && reg.installing.state) || (reg.waiting && reg.waiting.state) || 'unknown';
        info.updateAvailable = !!reg.waiting;
      }
    } catch (e) { /* ignore */ }
  }
  state.swInfo = info;
  render();
}
// ---------- bank import review ----------

export async function setStagedField(id, patch) {
  await api('/api/import/staged/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
  const row = state.staged.find(r => r.id === id);
  if (row) Object.assign(row, patch);
  render();
}

export function decideStaged(id, decision) {
  // Clicking the decision already showing clears it, so a row can always be
  // put back to undecided rather than being stuck once touched.
  const row = state.staged.find(r => r.id === id);
  const next = row && row.decision === decision ? 'pending' : decision;
  return setStagedField(id, { decision: next });
}

export async function syncBankAction() {
  state.importBusy = true; state.importMsg = 'Asking your bank…'; render();
  try {
    const res = await api('/api/bank/sync', {
      method: 'POST', body: JSON.stringify({ days: parseInt(state.syncDays, 10) || 30 })
    });
    const bits = [`${res.added} new to review`];
    if (res.already_known) bits.push(`${res.already_known} already handled`);
    if (res.pending) bits.push(`${res.pending} still pending at the bank`);
    if (res.wrong_currency) bits.push(`${res.wrong_currency} in another currency, skipped`);
    if (res.unmapped) bits.push(`${res.unmapped} from unlinked accounts`);
    state.importMsg = bits.join(' · ');
    // The bank's own figure against ours: a feed that omits some movements
    // makes an account drift silently, and this is where that shows up.
    (res.balances || []).forEach(b => {
      if (Math.abs(b.bank - b.app) > 0.01) {
        state.importMsg += `\n${b.feed}: bank says ${b.bank}, we have ${b.app}`;
      }
    });
    (res.errors || []).forEach(e => { state.importMsg += `\n${e.feed}: ${e.error}`; });
  } catch (e) {
    try { state.importMsg = JSON.parse(e.message).detail; } catch (_) { state.importMsg = 'Sync failed'; }
  }
  state.importBusy = false;
  await loadAll();
  render();
}

export async function loadAspsps() {
  state.aspspLoading = true; render();
  try {
    state.aspsps = await api('/api/bank/aspsps?country=' + encodeURIComponent(state.aspspCountry));
  } catch (e) {
    state.aspsps = [];
    try { state.formError = JSON.parse(e.message).detail; } catch (_) { state.formError = 'Could not list banks'; }
  }
  state.aspspLoading = false;
  render();
}

export function openConnectBank() {
  state.aspsps = []; state.formError = '';
  openModal('connectBank');
  loadAspsps();
}

export async function connectBankAction(name, country) {
  try {
    const res = await api('/api/bank/connect', { method: 'POST', body: JSON.stringify({ aspsp_name: name, country }) });
    // Hand the browser to the bank's own login. Everything from here happens
    // on the bank's site until it redirects back to /api/bank/callback.
    window.location.href = res.url;
  } catch (e) {
    try { state.formError = JSON.parse(e.message).detail; } catch (_) { state.formError = 'Could not start the connection'; }
    render();
  }
}

export async function commitImportAction() {
  state.importBusy = true; state.importMsg = ''; render();
  try {
    const res = await api('/api/import/commit', { method: 'POST' });
    state.importMsg = `Imported ${res.imported}, linked ${res.linked}, skipped ${res.skipped}.`;
  } catch (e) {
    try { state.importMsg = JSON.parse(e.message).detail; } catch (_) { state.importMsg = 'Import failed'; }
  }
  state.importBusy = false;
  await loadAll();
  render();
}

export async function cancelImportAction() {
  state.importBusy = true; render();
  try {
    const res = await api('/api/import/cancel', { method: 'POST' });
    state.importMsg = `Discarded ${res.discarded} row${res.discarded === 1 ? '' : 's'}. Nothing was imported.`;
  } catch (e) { state.importMsg = 'Could not clear the queue'; }
  state.importBusy = false;
  await loadAll();
  render();
}

export async function mapFeedAction(uuid, accountId) {
  await api('/api/import/feeds/' + uuid, { method: 'PATCH', body: JSON.stringify({ account_id: accountId || null }) });
  await loadAll();
  render();
}

export async function toggleFeedSyncAction(uuid, enabled) {
  await api('/api/import/feeds/' + uuid, { method: 'PATCH', body: JSON.stringify({ sync_enabled: enabled }) });
  await loadAll();
  render();
}

export function openAboutModal() {
  state.swInfo = null;
  openModal('about');
  refreshSwStatus();
}
