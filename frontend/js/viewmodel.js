import { state } from './state.js';
import { TH, ACCENT, GREY } from './theme-runtime.js';
import { RED, GREEN, PAL, ICONS, MONTHS, M3, DAYS, APP_VERSION } from './constants.js';
import { render } from './render.js';
import {
  reopenAccount, toggleNetWorthAction, openAboutModal,
  decideStaged, setStagedField, mapFeedAction, toggleFeedSyncAction,
  connectBankAction, loadAspsps
} from './actions.js';

// ---------- helpers ported from the design ----------
// Single source of truth for the number-format preference (comma-decimal
// "de-DE" vs point-decimal "en-US") so money()/num()/short() and every
// other locale-aware formatter stay coherent with one setting.
export function locale() { return state.numberFormat === 'point' ? 'en-US' : 'de-DE'; }
export function money(v, plus) {
  const s = Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : plus && v > 0 ? '+' : '') + s + ' €';
}
export function short(v) { return Math.round(v).toLocaleString(locale()) + ' €'; }
export function num(v) {
  const s = String(v);
  // 'point' mode: '.' is the decimal separator, ',' is the thousands
  // separator (en-US convention) — the opposite of the default 'comma'
  // mode (de-DE convention), where '.' is stripped as thousands and ','
  // becomes the decimal point.
  return state.numberFormat === 'point'
    ? parseFloat(s.replace(/,/g, '')) || 0
    : parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}
// Formats a raw number for pre-filling an *editable* form field, in
// exactly the format num() will parse back — money() already does this
// correctly (that's why editRecurring/editMovement already round-trip
// through it); this just saves repeating the "strip the currency
// suffix" boilerplate at every call site, including non-currency values
// like a percentage rate, since only the decimal/thousands convention
// matters here, not the € sign.
export function numStr(v) { return money(v).replace(' €', '').trim(); }
export function dm(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
export function cat(id) { return state.cats.find(c => c.id === id); }
export function acct(id) { return state.accounts.find(a => a.id === id); }
export function set(k, v) { state.form[k] = v; }

export function periodFor(a) {
  if (state.mode === 'week') {
    const start = new Date(a); start.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end, title: 'WEEK ' + dm(start) };
  }
  if (state.mode === 'month') return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 0), title: MONTHS[a.getMonth()].toUpperCase() + ' ' + a.getFullYear() };
  if (state.mode === 'quarter') { const q = Math.floor(a.getMonth() / 3) * 3; return { start: new Date(a.getFullYear(), q, 1), end: new Date(a.getFullYear(), q + 3, 0), title: 'Q' + (q / 3 + 1) + ' ' + a.getFullYear() }; }
  return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31), title: 'YEAR ' + a.getFullYear() };
}
export function period() { return periodFor(state.anchor); }
export function shiftedAnchor(dir) {
  const a = new Date(state.anchor);
  if (state.mode === 'week') a.setDate(a.getDate() + 7 * dir);
  else if (state.mode === 'month') a.setMonth(a.getMonth() + dir);
  else if (state.mode === 'quarter') a.setMonth(a.getMonth() + 3 * dir);
  else a.setFullYear(a.getFullYear() + dir);
  return a;
}
export function shiftPeriod(dir) { state.anchor = shiftedAnchor(dir); }
export function months() { const p = period(); return Math.max(1, Math.round((p.end - p.start) / 86400000 / 30.4)); }
export function scoped() { const p = period(); return state.tx.filter(t => t._date >= p.start && t._date <= p.end); }
export function totals() {
  const rows = scoped(), byCat = {}, counts = {};
  let exp = 0, inc = 0;
  rows.forEach(t => {
    if (t.type === 'Expense') exp += t.amount; else if (t.type === 'Income') inc += t.amount; else return;
    byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount;
    counts[t.category_id] = (counts[t.category_id] || 0) + 1;
  });
  return { rows, byCat, counts, exp, inc };
}
export function unbudgeted() { return state.cats.filter(c => c.kind === 'expense' && state.budgets[c.id] === undefined); }
export function monthlyEquivalent(r) {
  if (r.amount_mode === 'full_balance' || r.amount_mode === 'amortized') return 0; // future amount isn't a fixed number, can't project
  const n = r.interval_n || 1;
  if (r.freq === 'daily') return r.amount * 30.44 / n;
  if (r.freq === 'weekly') return r.amount * 4.348 / n;
  if (r.freq === 'yearly') return r.amount / (12 * n);
  return r.amount / n; // monthly, monthly_nth_business_day
}
export function describeFrequency(r) {
  if (r.amount_mode === 'amortized') {
    const rate = ((r.annual_rate || 0) * 100).toLocaleString(locale(), { maximumFractionDigits: 2 });
    return `Amortized loan payment on the ${r.day_of_month}${r.day_of_month === 1 ? 'st' : r.day_of_month === 2 ? 'nd' : r.day_of_month === 3 ? 'rd' : 'th'} · ${rate}% fixed rate`;
  }
  const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const every = r.interval_n > 1 ? `Every ${r.interval_n} ` : null;
  let base;
  if (r.freq === 'daily') base = every ? `${every}days` : 'Daily';
  else if (r.freq === 'weekly') base = every ? `${every}weeks on ${WD[r.weekday]}` : `Weekly on ${WD[r.weekday]}`;
  else if (r.freq === 'monthly') base = every ? `${every}months on the ${ord(r.day_of_month)}` : `Monthly on the ${ord(r.day_of_month)}`;
  else if (r.freq === 'yearly') base = `${every ? every + 'years' : 'Yearly'} on ${MONTHS[r.month_of_year - 1]} ${ord(r.day_of_month)}`;
  else if (r.freq === 'monthly_nth_business_day') {
    const nb = r.nth_business_day;
    base = nb === -1 ? 'Last business day of the month' : nb === 1 ? 'First business day of the month'
      : nb > 0 ? `${ord(nb)} business day of the month` : `${ord(-nb)}-to-last business day of the month`;
  } else base = r.freq;
  if (r.weekend_rule === 'before') base += ' · moved earlier if on a weekend';
  else if (r.weekend_rule === 'after') base += ' · moved later if on a weekend';
  return base;
}
export function netWorthHistory(monthsBack) {
  const s = state;
  // Account-aware: a transaction's effect on the *counted* total depends
  // on which side(s) of it touch an included account, not just its type.
  // A transfer between two included accounts still nets to zero (money
  // just moved within what you're counting); a transfer touching only
  // one included side must move the total, not cancel out — e.g. paying
  // down an excluded loan from an included checking account should
  // reduce counted net worth by that amount.
  const included = new Set(s.accounts.filter(a => a.include_in_net_worth).map(a => a.id));
  const sorted = s.tx.slice().sort((a, b) => a._date - b._date);
  const now = new Date();
  let idx = 0, running = s.accounts.reduce((a, acc) => a + (included.has(acc.id) ? acc.starting_balance : 0), 0);
  const points = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const boundary = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    while (idx < sorted.length && sorted[idx]._date <= boundary) {
      const t = sorted[idx];
      if (t.type === 'Income') {
        if (included.has(t.account_id)) running += t.amount;
      } else if (t.type === 'Transfer internal') {
        if (included.has(t.account_id)) running -= t.amount;
        if (t.to_account_id && included.has(t.to_account_id)) running += t.amount;
      } else { // Expense, Transfer external
        if (included.has(t.account_id)) running -= t.amount;
      }
      idx++;
    }
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({ label: M3[d.getMonth()], value: running });
  }
  return points;
}
export function toggle(key, id) {
  const arr = state[key];
  state[key] = arr.indexOf(id) < 0 ? arr.concat([id]) : arr.filter(x => x !== id);
}
export function openModal(kind, editId, form) {
  state.modal = kind; state.editId = editId || null; state.drawerOpen = false; state.formError = '';
  state.form = Object.assign({
    name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: state.accounts[0] ? state.accounts[0].id : '', toAccount: '',
    icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense', iban: '', note: '',
    recurMovement: 'Expense', freq: 'monthly', intervalN: '1', weekday: '0', dayOfMonth: '1', monthOfYear: '1',
    nthBusinessDay: '-1', weekendRule: 'none', startDate: new Date().toISOString().slice(0, 10), endDate: '', noEnd: true,
    dangerPassword: '', dangerConfirm: '', currentPassword: '', newPassword: '', confirmNewPassword: '',
    autopayEnabled: false, autopayFrom: (state.accounts.find(x => x.grp === 'spend') || {}).id || '', autopayDay: '1', autopayWeekendRule: 'none',
    loanFrom: (state.accounts.find(x => x.grp === 'spend') || {}).id || '', loanRate: '', loanTermMonths: '',
    loanCategory: (state.cats.find(c => c.name === 'Loan Interest') || state.cats.find(c => c.kind === 'expense') || {}).id || '',
    loanDay: '1', loanWeekendRule: 'none',
    extraPaymentAmount: '', extraPaymentDate: new Date().toISOString().slice(0, 10), extraPaymentRuleId: '',
    extraPaymentFrom: (state.accounts.find(x => x.grp === 'spend') || {}).id || '',
    backupFileData: null, backupFileName: '', backupPassword: '', backupConfirm: ''
  }, form || {});
  render();
}

// ---------- view model (ported from the design's renderVals()) ----------
export function computeView() {
  const s = state, P = period(), T = totals(), M = months();
  const spendable = s.accounts.filter(a => a.grp === 'spend').reduce((x, a) => x + a.balance, 0);
  const total = s.accounts.filter(a => a.include_in_net_worth).reduce((x, a) => x + a.balance, 0);
  const saldo = T.inc - T.exp;
  const expView = s.view === 'expenses';

  const nav = [['overview', 'Overview', 'ic-bars'], ['accounts', 'Accounts', 'ic-coins'], ['categories', 'Categories', 'ic-donut'], ['balance', 'Movements', 'ic-receipt'], ['budget', 'Budget', 'ic-gauge'], ['import', 'Import', 'ic-download']];

  let cells;
  if (s.page === 'import') {
    const undecided = s.staged.filter(r => r.decision === 'pending').length;
    const ready = s.staged.filter(r => r.decision === 'import' || r.decision === 'link').length;
    const flagged = s.staged.filter(r => r.decision === 'pending' && r.match_tx_id).length;
    cells = [
      { label: 'To review', value: String(undecided), color: TH.text },
      { label: 'Possible duplicates', value: String(flagged), color: flagged ? RED : GREY },
      { label: 'Ready', value: String(ready), color: ready ? GREEN : TH.text }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'accounts') {
    cells = [
      { label: 'Spendable', value: money(spendable), color: TH.text },
      { label: 'Savings', value: money(total - spendable), color: GREEN },
      { label: 'Net worth', value: money(total), color: TH.text }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'balance' && s.balanceTab === 'recurring') {
    const active = s.recurring.filter(r => r.active);
    const monthlyExp = active.filter(r => r.type === 'Expense').reduce((a, r) => a + monthlyEquivalent(r), 0);
    const monthlyInc = active.filter(r => r.type === 'Income').reduce((a, r) => a + monthlyEquivalent(r), 0);
    cells = [
      { label: 'Monthly commitment', value: money(monthlyExp), color: RED },
      { label: 'Active rules', value: String(active.length), color: TH.text },
      { label: 'Recurring income', value: money(monthlyInc), color: GREEN }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'balance') {
    const net = T.rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0);
    cells = [
      { label: 'Start balance', value: money(total - net), color: GREY },
      { label: 'Change', value: money(net, true), color: net < 0 ? RED : GREEN },
      { label: 'End balance', value: money(total), color: TH.text }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'overview') {
    // Overview has no time-window selector (a snapshot dashboard, not a
    // scoped report) — these three are plain, non-interactive, all-time
    // figures rather than the period-scoped, clickable view-switcher used
    // on Categories/Budget.
    const allExp = s.tx.reduce((a, t) => a + (t.type === 'Expense' ? t.amount : 0), 0);
    const allInc = s.tx.reduce((a, t) => a + (t.type === 'Income' ? t.amount : 0), 0);
    cells = [
      { label: 'Expenses', value: money(allExp), color: RED },
      { label: 'Balance', value: money(total), color: TH.text },
      { label: 'Income', value: money(allInc), color: GREEN }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else {
    const sel = k => s.view === k;
    cells = [
      { key: 'expenses', label: s.page === 'budget' ? 'Budget EXPENSES' : 'Expenses', value: money(T.exp), color: RED },
      { key: 'saldo', label: 'Saldo', value: money(saldo, true), color: saldo < 0 ? RED : GREEN },
      { key: 'income', label: s.page === 'budget' ? 'Budget INCOME' : 'Income', value: money(T.inc), color: GREEN }
    ].map(c => Object.assign(c, {
      labelColor: sel(c.key) ? TH.text : GREY, weight: sel(c.key) ? '700' : '500',
      underline: sel(c.key) ? c.color : 'transparent', cursor: 'pointer',
      onClick: () => { s.view = c.key; render(); }
    }));
  }

  const editAccount = a => openModal('account', a.id, {
    name: a.name, type: a.type,
    balance: (a.grp === 'credit' || a.grp === 'loan') ? numStr(Math.abs(a.starting_balance)) : numStr(a.starting_balance),
    goal: a.goal_amount ? numStr(a.goal_amount) : '', kind: a.grp, iban: a.iban || '',
    autopayEnabled: !!(a.autopay && a.autopay.enabled),
    autopayFrom: a.autopay && a.autopay.from_account_id ? a.autopay.from_account_id : ((s.accounts.find(x => x.grp === 'spend') || {}).id || ''),
    autopayDay: a.autopay ? String(a.autopay.day_of_month) : '1',
    autopayWeekendRule: a.autopay ? a.autopay.weekend_rule : 'none',
    loanFrom: a.loan && a.loan.from_account_id ? a.loan.from_account_id : ((s.accounts.find(x => x.grp === 'spend') || {}).id || ''),
    loanRate: a.loan ? numStr((a.loan.annual_rate || 0) * 100) : '',
    loanTermMonths: a.loan ? String(a.loan.term_months_remaining) : '',
    loanCategory: a.loan && a.loan.category_id ? a.loan.category_id : ((s.cats.find(c => c.name === 'Loan Interest') || s.cats.find(c => c.kind === 'expense') || {}).id || ''),
    loanDay: a.loan ? String(a.loan.day_of_month) : '1',
    loanWeekendRule: a.loan ? a.loan.weekend_rule : 'none'
  });
  const addExtraPayment = a => {
    const rule = s.recurring.find(r => r.to_account_id === a.id && r.amount_mode === 'amortized');
    openModal('extraPayment', a.id, {
      extraPaymentAmount: '', extraPaymentDate: new Date().toISOString().slice(0, 10),
      extraPaymentRuleId: rule ? rule.id : '',
      extraPaymentFrom: rule ? rule.account_id : ((s.accounts.find(x => x.grp === 'spend') || {}).id || '')
    });
  };
  const accountGroups = [
    { key: 'spend', title: 'Accounts' }, { key: 'save', title: 'Savings accounts' },
    { key: 'credit', title: 'Credit cards' }, { key: 'loan', title: 'Loans' }
  ].map(g => {
    const items = s.accounts.filter(a => a.grp === g.key && a.active);
    const isCredit = g.key === 'credit', isLoan = g.key === 'loan';
    const groupSum = items.reduce((x, a) => x + a.balance, 0);
    return {
      title: g.title, total: money(groupSum), totalColor: groupSum < 0 ? RED : GREEN,
      items: items.map(a => {
        const own = s.tx.filter(t => t.account_id === a.id);
        const owed = isCredit ? Math.max(0, -a.balance) : 0;
        const utilPct = isCredit && a.goal_amount ? Math.min(100, owed / a.goal_amount * 100) : 0;
        const paidOff = isLoan && a.goal_amount ? Math.min(100, Math.max(0, (a.goal_amount + a.balance) / a.goal_amount * 100)) : 0;
        return {
          id: a.id, name: a.name, type: a.type, icon: '#' + a.icon, color: a.color, balance: money(a.balance),
          balanceColor: a.balance < 0 ? RED : GREEN,
          hasGoal: !isCredit && !isLoan && !!a.goal_amount,
          goalPct: !isCredit && !isLoan && a.goal_amount ? Math.min(100, a.balance / a.goal_amount * 100) + '%' : '0%',
          goalLabel: !isCredit && !isLoan && a.goal_amount ? Math.round(a.balance / a.goal_amount * 100) + '% of ' + short(a.goal_amount) : '',
          hasUtil: isCredit && !!a.goal_amount,
          utilPct: utilPct + '%',
          utilColor: utilPct > 70 ? RED : utilPct > 30 ? '#e8890c' : '#40c057',
          utilLabel: isCredit && a.goal_amount ? Math.round(utilPct) + '% of ' + short(a.goal_amount) + ' limit' : '',
          hasPayoff: isLoan && !!a.goal_amount,
          payoffPct: paidOff + '%',
          payoffLabel: isLoan && a.goal_amount ? Math.round(paidOff) + '% paid off of ' + short(a.goal_amount) : '',
          autopayLabel: !isCredit ? '' : (a.autopay && a.autopay.enabled
            ? 'Autopay ' + (a.autopay.next_date ? 'on ' + dm(new Date(a.autopay.next_date + 'T00:00:00')) : 'scheduled')
            : 'Autopay off'),
          loanLabel: !isLoan ? '' : (a.loan
            ? (a.loan.paid_off ? 'Paid off' : 'Next payment ' + (a.loan.next_date ? dm(new Date(a.loan.next_date + 'T00:00:00')) : '—') + ' · ' + a.loan.term_months_remaining + ' left')
            : 'No schedule set'),
          isLoan,
          includedInNetWorth: !!a.include_in_net_worth,
          meta: own.length ? own.length + ' mov.' : 'new',
          onClick: () => { s.page = 'balance'; s.balanceTab = 'movements'; s.fAccounts = [a.id]; s.filtersOpen = true; render(); },
          onEdit: () => editAccount(a),
          onDelete: () => openModal('deleteAccount', a.id),
          onExtraPayment: () => addExtraPayment(a),
          onToggleNetWorth: () => toggleNetWorthAction(a)
        };
      })
    };
  }).filter(g => g.items.length);
  const closedAccounts = s.accounts.filter(a => !a.active).map(a => ({
    name: a.name, icon: '#' + a.icon, color: a.color, balance: money(a.balance),
    onReopen: () => reopenAccount(a.id),
    onDelete: () => openModal('deleteAccount', a.id)
  }));

  const editMovement = t => openModal('movement', t.id, {
    movement: t.type, category: t.category_id || '', amount: money(t.amount).replace(' €', '').trim(),
    account: t.account_id, toAccount: t.to_account_id || '', note: t.note || ''
  });
  const editRecurring = r => openModal('recurring', r.id, {
    name: r.name, recurMovement: r.type, account: r.account_id, toAccount: r.to_account_id || '',
    category: r.category_id || '', amount: money(r.amount).replace(' €', '').trim(), note: r.note || '',
    freq: r.freq, intervalN: String(r.interval_n), weekday: String(r.weekday != null ? r.weekday : 0),
    dayOfMonth: String(r.day_of_month || 1), monthOfYear: String(r.month_of_year || 1),
    nthBusinessDay: String(r.nth_business_day != null ? r.nth_business_day : -1), weekendRule: r.weekend_rule,
    startDate: r.start_date, endDate: r.end_date || '', noEnd: !r.end_date
  });
  const recurringRows = s.recurring.map(r => {
    const c = cat(r.category_id), a = acct(r.account_id), toA = acct(r.to_account_id);
    const isFullBalance = r.amount_mode === 'full_balance';
    const isAmortized = r.amount_mode === 'amortized';
    return {
      id: r.id, name: r.name, active: !!r.active,
      icon: '#' + (isFullBalance ? 'ic-card' : isAmortized ? 'ic-bank' : c ? c.icon : (r.type === 'Income' ? 'ic-salary' : 'ic-refresh')),
      color: (isFullBalance || isAmortized) ? (toA ? toA.color : GREY) : c ? c.color : (r.type === 'Income' ? GREEN : GREY),
      amount: isFullBalance ? 'Full balance' : isAmortized ? 'Interest + principal' : money(r.type === 'Expense' ? -r.amount : r.amount, r.type === 'Income'),
      amountColor: (isFullBalance || isAmortized) ? GREY : r.type === 'Expense' ? RED : r.type === 'Income' ? GREEN : GREY,
      account: a ? a.name : '—',
      freqLabel: describeFrequency(r),
      nextLabel: !r.active ? 'Paused' : (r.next_date ? 'Next: ' + dm(new Date(r.next_date + 'T00:00:00')) : 'Finished'),
      nextColor: !r.active ? TH.textFaint : GREY,
      dimmed: !r.active,
      onClick: () => editRecurring(r),
      onEdit: () => editRecurring(r),
      onDelete: () => openModal('deleteRecurring', r.id)
    };
  }).sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

  const kind = s.view === 'income' ? 'income' : 'expense';
  const donutBase = s.view === 'income' ? T.inc : T.exp;
  const donutCats = s.cats.filter(c => c.kind === (s.view === 'income' ? 'income' : 'expense'))
    .map(c => ({ c, v: T.byCat[c.id] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  let accSum = 0;
  const stops = donutCats.map(x => {
    const from = accSum / (donutBase || 1) * 100; accSum += x.v;
    return x.c.color + ' ' + from.toFixed(2) + '% ' + (accSum / (donutBase || 1) * 100).toFixed(2) + '%';
  });
  const donut = stops.length ? 'conic-gradient(' + stops.join(',') + ')' : 'conic-gradient(#e9ebef 0 100%)';
  const legend = donutCats.slice(0, 6).map(x => ({
    name: x.c.name, color: x.c.color, icon: '#' + x.c.icon, amount: money(x.v),
    pct: (x.v / (donutBase || 1) * 100).toFixed(1) + '%'
  }));

  const mkCards = k => s.cats.filter(c => c.kind === k).map(c => {
    const t = T.byCat[c.id] || 0, lim = s.budgets[c.id] ? s.budgets[c.id] * M : 0;
    return {
      name: c.name, color: c.color, icon: '#' + c.icon, total: money(t),
      budgetNote: lim ? money(lim) : (T.counts[c.id] || 0) + ' mov.',
      budgetColor: lim ? (t > lim ? RED : GREY) : TH.textFaint,
      onClick: () => openModal('category', c.id, { name: c.name, icon: c.icon, color: c.color, kind: c.kind })
    };
  });
  const catSections = (s.view === 'income' ? [['income', 'Income categories', T.inc]] : s.view === 'saldo'
    ? [['expense', 'Expense categories', T.exp], ['income', 'Income categories', T.inc]]
    : [['expense', 'Expense categories', T.exp]]).map(x => ({ title: x[1], total: money(x[2]), items: mkCards(x[0]) }));

  let rows = T.rows;
  if (s.fAccounts.length) rows = rows.filter(t => s.fAccounts.indexOf(t.account_id) >= 0);
  if (s.fTypes.length) rows = rows.filter(t => s.fTypes.indexOf(t.type) >= 0);
  if (s.fCats.length) rows = rows.filter(t => t.category_id && s.fCats.indexOf(t.category_id) >= 0);
  const groups = [];
  rows.slice(0, 90).forEach(t => {
    const key = t._date.toDateString();
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, date: t._date, items: [], net: 0 }; groups.push(g); }
    const c = cat(t.category_id), a = acct(t.account_id);
    const isExp = t.type === 'Expense', isInc = t.type === 'Income';
    g.net += isExp ? -t.amount : isInc ? t.amount : 0;
    g.items.push({
      title: c ? c.name : (t.type === 'Transfer internal' ? 'Internal transfer' : 'External transfer'),
      icon: '#' + (c ? c.icon : 'ic-transfer'), color: c ? c.color : GREY,
      account: a ? a.name : '—', accountIcon: '#' + (a ? a.icon : 'ic-wallet'),
      amount: money(isExp ? -t.amount : t.amount, isInc), type: t.type, note: t.note || '',
      amountColor: isExp ? RED : isInc ? GREEN : GREY,
      onEdit: () => editMovement(t),
      onDelete: () => openModal('deleteMovement', t.id)
    });
  });
  const dayGroups = groups.map(g => ({
    day: g.date.getDate(), weekday: DAYS[g.date.getDay()], month: MONTHS[g.date.getMonth()].toUpperCase() + ' ' + g.date.getFullYear(),
    net: money(g.net, true), netColor: g.net < 0 ? RED : g.net > 0 ? GREEN : GREY, items: g.items
  }));
  const chip = (label, icon, color, active, onClick) => ({
    label, icon: '#' + icon, onClick, active,
    border: active ? color : TH.border, bg: active ? color + '14' : TH.surface, color: active ? color : GREY
  });
  const filterGroups = [
    { title: 'Movement type', items: [['Income', 'ic-salary', GREEN], ['Expense', 'ic-cart', RED], ['Transfer internal', 'ic-transfer', ACCENT], ['Transfer external', 'ic-transfer', GREY]].map(t => chip(t[0], t[1], t[2], s.fTypes.indexOf(t[0]) >= 0, () => { toggle('fTypes', t[0]); render(); })) },
    { title: 'Accounts', items: s.accounts.map(a => chip(a.name, a.icon, a.color, s.fAccounts.indexOf(a.id) >= 0, () => { toggle('fAccounts', a.id); render(); })) },
    { title: 'Expense categories', items: s.cats.filter(c => c.kind === 'expense').map(c => chip(c.name, c.icon, c.color, s.fCats.indexOf(c.id) >= 0, () => { toggle('fCats', c.id); render(); })) },
    { title: 'Income categories', items: s.cats.filter(c => c.kind === 'income').map(c => chip(c.name, c.icon, c.color, s.fCats.indexOf(c.id) >= 0, () => { toggle('fCats', c.id); render(); })) }
  ];
  const fCount = s.fAccounts.length + s.fTypes.length + s.fCats.length;

  const chartTx = T.rows.filter(t => t.type === (expView ? 'Expense' : 'Income'));
  const buckets = [];
  if (s.mode === 'year' || s.mode === 'quarter') {
    for (let m = P.start.getMonth(); m <= P.end.getMonth(); m++) buckets.push({ k: 'm' + m, label: M3[m], full: MONTHS[m] });
  } else {
    const d = new Date(P.start);
    while (d <= P.end) {
      const day = d.getDate();
      buckets.push({ k: 'd' + day, label: s.mode === 'week' ? M3[d.getMonth()] + ' ' + day : (day % 5 === 0 || day === 1 ? String(day) : ''), full: day + ' ' + MONTHS[d.getMonth()] });
      d.setDate(day + 1);
    }
  }
  buckets.forEach(b => { b.byCat = {}; b.total = 0; });
  chartTx.forEach(t => {
    const k = (s.mode === 'year' || s.mode === 'quarter') ? 'm' + t._date.getMonth() : 'd' + t._date.getDate();
    const b = buckets.find(x => x.k === k);
    if (!b) return;
    b.byCat[t.category_id] = (b.byCat[t.category_id] || 0) + t.amount;
    b.total += t.amount;
  });
  const rawPeak = Math.max(1, ...buckets.map(b => b.total));
  const step = Math.pow(10, Math.floor(Math.log10(rawPeak)));
  const peak = Math.ceil(rawPeak / (step / 2)) * (step / 2);
  const axis = [4, 3, 2, 1, 0].map(i => Math.round(peak * i / 4).toLocaleString(locale()));
  const bars = buckets.map(b => ({
    label: b.label, height: Math.max(0.5, b.total / peak * 100) + '%', tip: b.full + ' · ' + money(b.total),
    segments: Object.keys(b.byCat).sort((x, y) => b.byCat[y] - b.byCat[x]).map(id => {
      const c = cat(+id);
      return { h: (b.byCat[id] / b.total * 100) + '%', color: c ? c.color : TH.textFaint };
    })
  }));
  const spanDays = Math.max(1, Math.round((Math.min(P.end, new Date()) - P.start) / 86400000) + 1);
  const spendChartTitle = (expView ? 'Expenses' : 'Income') + ' · ' + P.title;

  const bIds = Object.keys(s.budgets).map(Number).filter(id => cat(id));
  const budgetRows = bIds.map(id => {
    const c = cat(id), lim = s.budgets[id] * M, sp = T.byCat[id] || 0, pct = sp / lim * 100;
    const col = pct > 100 ? RED : pct > 85 ? '#e8890c' : ACCENT;
    return {
      name: c.name, color: c.color, icon: '#' + c.icon, spent: money(sp), limit: money(lim),
      pct: Math.round(pct) + '%', width: Math.min(100, pct) + '%', barColor: col,
      left: pct > 100 ? money(sp - lim) + ' over' : money(lim - sp) + ' left',
      onClick: () => openModal('budget', id, { category: id, limit: numStr(s.budgets[id]) })
    };
  }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));
  const gLim = bIds.reduce((a, id) => a + s.budgets[id] * M, 0);
  const gSp = bIds.reduce((a, id) => a + (T.byCat[id] || 0), 0);
  const gPct = gLim ? gSp / gLim * 100 : 0;
  const gOver = gPct > 100;

  const nwPoints = netWorthHistory(6);
  const nwVals = nwPoints.map(p => p.value);
  const nwMin = Math.min(...nwVals), nwMax = Math.max(...nwVals), nwFlat = nwMax === nwMin;
  const nwPad = 4, nwH = 34, nwInner = nwH - nwPad * 2;
  const nwCoords = nwPoints.map((p, i) => {
    const x = nwPoints.length > 1 ? i / (nwPoints.length - 1) * 100 : 50;
    const y = nwPad + (nwFlat ? nwInner / 2 : nwInner - (p.value - nwMin) / (nwMax - nwMin) * nwInner);
    return { x, y };
  });
  const nwPath = nwCoords.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
  const nwDelta = nwVals[nwVals.length - 1] - nwVals[0];
  const netWorthTrend = {
    current: money(nwVals[nwVals.length - 1]),
    changeLabel: money(nwDelta, true) + ' · 6mo',
    changeColor: nwDelta < 0 ? RED : GREEN,
    path: nwPath, area: nwPath + ` L100,${nwH} L0,${nwH} Z`,
    labels: nwPoints.map(p => p.label)
  };
  // ---- loan payoff projection (Overview widget) ----
  // Historical portion is built from real transactions — a loan's balance
  // only ever changes on a transaction date (there's no daily accrual
  // modeled), so it's genuinely a step function: flat between payments,
  // then a discrete drop on each scheduled payment AND on any manual
  // prepayment (a plain Transfer internal into the loan account, piggy
  // button or not — same mechanism). Plotting real transaction dates
  // instead of a smooth curve is what makes a prepayment show up as an
  // actual step, without touching any earlier point on the line. The
  // future portion (from today to the loan's scheduled end date) is a
  // projection using the same amortization formula as
  // backend/recurring.py's _amortized_payment — an estimate, not
  // authoritative ledger data, so it doesn't need to match generate_due()'s
  // future rounding to the cent.
  const amortizedPaymentJs = (principal, monthlyRate, n) => {
    if (n <= 0) return principal;
    if (monthlyRate === 0) return principal / n;
    const factor = Math.pow(1 + monthlyRate, n);
    return principal * monthlyRate * factor / (factor - 1);
  };
  const stepValueAt = (points, t, key) => {
    let val = points[0][key];
    for (const p of points) {
      if (+p.date > t) break;
      val = p[key];
    }
    return val;
  };
  const activeLoans = s.accounts.filter(a => a.grp === 'loan' && a.active && a.loan && a.loan.annual_rate != null && a.loan.start_date && a.loan.end_date);
  let loanPayoffTrend = null;
  if (activeLoans.length) {
    const today = new Date();
    const loanSeries = activeLoans.map(a => {
      const start = new Date(a.loan.start_date + 'T00:00:00');
      const end = new Date(a.loan.end_date + 'T00:00:00');
      const monthlyRate = (a.loan.annual_rate || 0) / 12;
      const interestByDate = {};
      if (a.loan.rule_id) {
        s.tx.filter(t => t.recurring_id === a.loan.rule_id && t.type === 'Expense')
          .forEach(t => { interestByDate[t.date] = (interestByDate[t.date] || 0) + t.amount; });
      }
      let owed = Math.max(0, -a.starting_balance);
      let interestCum = 0;
      const points = [{ date: start, owed, interestCum }];
      s.tx.filter(t => t.to_account_id === a.id && t.type === 'Transfer internal')
        .slice().sort((x, y) => x._date - y._date)
        .forEach(t => {
          owed = Math.max(0, owed - t.amount);
          interestCum += interestByDate[t.date] || 0;
          points.push({ date: t._date, owed, interestCum });
        });
      // Flat line up to today even if the last real payment was a while ago.
      points.push({ date: today, owed, interestCum });
      // Projected future: monthly, recomputing the payment fresh each cycle
      // from the current balance — exactly what generate_due() will do.
      if (!a.loan.paid_off && owed > 0.5) {
        let remaining = a.loan.term_months_remaining, bal = owed;
        let cursor = a.loan.next_date ? new Date(a.loan.next_date + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
        while (remaining > 0 && bal > 0.005) {
          const payment = amortizedPaymentJs(bal, monthlyRate, remaining);
          const interest = bal * monthlyRate;
          const principal = Math.min(bal, payment - interest);
          bal = Math.max(0, bal - principal);
          interestCum += interest;
          points.push({ date: new Date(cursor), owed: bal, interestCum });
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
          remaining--;
        }
      }
      const lastDate = points[points.length - 1].date;
      return { start, end: lastDate > end ? lastDate : end, points };
    }).filter(ls => {
      // A garbage rate/term on one account (e.g. a stray decimal-separator
      // typo landing an interest rate in the millions of percent) can blow
      // amortizedPaymentJs() up to Infinity, which turns every later point
      // in that loan's own series into NaN. Since every active loan shares
      // one y-scale below, a single contaminated series would otherwise
      // blank the combined chart for every loan, not just the bad one — so
      // drop just that account's series here instead.
      const ok = ls.points.every(p => Number.isFinite(p.owed) && Number.isFinite(p.interestCum));
      if (!ok) console.warn('[mm debug] excluding a loan account from the payoff projection — its rate/term produced non-finite values', ls);
      return ok;
    });
    if (loanSeries.length) {
    const overallStart = new Date(Math.min(...loanSeries.map(ls => +ls.start)));
    const overallEnd = new Date(Math.max(...loanSeries.map(ls => +ls.end), +today));
    const span = Math.max(1, +overallEnd - +overallStart);

    const dateSet = new Set([+overallStart, +overallEnd, +today]);
    loanSeries.forEach(ls => ls.points.forEach(p => dateSet.add(+p.date)));
    const allDates = Array.from(dateSet).sort((a, b) => a - b).map(t => new Date(t));
    const combined = allDates.map(d => ({
      date: d,
      owed: loanSeries.reduce((sum, ls) => sum + stepValueAt(ls.points, +d, 'owed'), 0),
      interestCum: loanSeries.reduce((sum, ls) => sum + stepValueAt(ls.points, +d, 'interestCum'), 0)
    }));

    const lpPad = 4, lpH = 34, lpInner = lpH - lpPad * 2;
    const lpMax = Math.max(1, ...combined.map(p => p.owed), ...combined.map(p => p.interestCum));
    const xAt = d => (+d - +overallStart) / span * 100;
    const yAt = v => lpPad + lpInner - (v / lpMax) * lpInner;
    // Step-after path: hold each value flat until the next point's date,
    // then drop/rise vertically — a real staircase, not an interpolated line.
    const stepPath = key => {
      let d = '';
      combined.forEach((p, i) => {
        const x = xAt(p.date), y = yAt(p[key]);
        if (i === 0) { d += `M${x.toFixed(2)},${y.toFixed(2)}`; return; }
        d += ` L${x.toFixed(2)},${yAt(combined[i - 1][key]).toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)}`;
      });
      return d;
    };
    const owedPath = stepPath('owed');
    const interestPath = stepPath('interestCum');

    let payoffPoint = combined.find(p => p.owed <= 0.5 && p.date >= today);
    const payoffDate = payoffPoint ? payoffPoint.date : overallEnd;
    const todayX = xAt(today);
    const labelCount = 6;
    const lpLabels = Array.from({ length: labelCount }, (_, k) => {
      const d = new Date(+overallStart + span * (k / (labelCount - 1)));
      return M3[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    });
    const currentOwed = stepValueAt(combined, +today, 'owed');
    const interestPaidToDate = stepValueAt(combined, +today, 'interestCum');
    loanPayoffTrend = {
      current: money(currentOwed),
      interestPaid: money(interestPaidToDate),
      payoffLabel: MONTHS[payoffDate.getMonth()] + ' ' + payoffDate.getFullYear(),
      path: owedPath, area: owedPath + ` L100,${lpH} L0,${lpH} Z`,
      interestPath,
      todayX: todayX.toFixed(2),
      labels: lpLabels
    };
    }
  }

  const dashboardAccounts = accountGroups.flatMap(g => g.items);
  const budgetWatch = budgetRows.slice(0, 3).map(b => Object.assign({}, b, { onClick: () => { s.page = 'budget'; render(); } }));

  const topCatsFor = (kind, n) => {
    const base = kind === 'income' ? T.inc : T.exp;
    return s.cats.filter(c => c.kind === kind)
      .map(c => ({ c, v: T.byCat[c.id] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n)
      .map(x => ({
        name: x.c.name, color: x.c.color, icon: '#' + x.c.icon, amount: money(x.v),
        pct: Math.round(x.v / (base || 1) * 100) + '%', width: Math.min(100, x.v / (base || 1) * 100) + '%'
      }));
  };
  const topExpenseCats = topCatsFor('expense', 5);
  const topIncomeCats = topCatsFor('income', 5);

  const prevP = periodFor(shiftedAnchor(-1));
  const prevExp = s.tx.filter(t => t._date >= prevP.start && t._date <= prevP.end && t.type === 'Expense').reduce((a, t) => a + t.amount, 0);
  const trendPct = prevExp > 0 ? ((T.exp - prevExp) / prevExp * 100) : (T.exp > 0 ? 100 : 0);
  const expenseDays = new Set(T.rows.filter(t => t.type === 'Expense').map(t => t._date.toDateString()));
  let noSpendDays = 0;
  for (let d = new Date(P.start), end = new Date(Math.min(P.end, new Date())); d <= end; d.setDate(d.getDate() + 1)) {
    if (!expenseDays.has(d.toDateString())) noSpendDays++;
  }
  const insight = {
    avgDaily: money(T.exp / spanDays),
    noSpendDays,
    trendLabel: (trendPct >= 0 ? '+' : '') + Math.round(trendPct) + '% vs previous period',
    trendColor: trendPct > 0 ? RED : trendPct < 0 ? GREEN : GREY
  };

  const recentTx = s.tx.slice(0, 5).map(t => {
    const c = cat(t.category_id), a = acct(t.account_id), isExp = t.type === 'Expense', isInc = t.type === 'Income';
    return {
      title: c ? c.name : (t.type === 'Transfer internal' ? 'Internal transfer' : 'External transfer'),
      icon: '#' + (c ? c.icon : 'ic-transfer'), color: c ? c.color : GREY,
      account: a ? a.name : '—', date: dm(t._date).slice(0, 5), note: t.note || '',
      amount: money(isExp ? -t.amount : t.amount, isInc), amountColor: isExp ? RED : isInc ? GREEN : GREY
    };
  });

  const modalMeta = {
    movement: [s.editId ? 'Edit movement' : 'New movement', 'Save'], account: [s.editId ? 'Edit account' : 'New account', 'Save'],
    category: [s.editId ? 'Edit category' : 'New category', 'Apply'],
    budget: [s.editId ? 'Edit budget' : 'Set budget', 'Save'],
    deleteAccount: ['Delete account', ''],
    deleteMovement: ['Delete movement', ''],
    recurring: [s.editId ? 'Edit recurring' : 'New recurring', 'Save'],
    deleteRecurring: ['Manage recurring rule', ''],
    settings: ['Settings', ''],
    deleteAllData: ['Delete all data', ''],
    changePassword: ['Change password', ''],
    extraPayment: ['Add extra payment', 'Add'],
    data: ['Data', ''],
    backups: ['Backups', ''],
    about: ['About', ''],
    connectBank: ['Connect a bank', '']
  }[s.modal] || ['', ''];
  // ---------- bank import review ----------
  const importAccountOptions = [{ v: '', l: 'Not linked' }]
    .concat(s.accounts.filter(a => a.active).map(a => ({ v: a.id, l: a.name })));

  const importFeeds = s.feeds.map(f => ({
    uuid: f.uuid,
    name: f.name || f.iban || f.uuid,
    iban: f.iban || '',
    mappedTo: f.account_id || '',
    syncEnabled: !!f.sync_enabled,
    accountOptions: importAccountOptions,
    onMap: e => mapFeedAction(f.uuid, e.target.value ? +e.target.value : null),
    onToggleSync: e => toggleFeedSyncAction(f.uuid, e.target.checked)
  }));

  const importRows = s.staged.map(r => {
    const a = acct(r.account_id);
    const isOut = r.direction === 'out';
    const isTransfer = r.tx_type === 'Transfer internal';
    const other = r.to_account_id ? acct(r.to_account_id) : null;
    const catOptions = [{ v: '', l: 'Uncategorised' }].concat(
      s.cats.filter(c => c.kind === (isOut ? 'expense' : 'income')).map(c => ({ v: c.id, l: c.name }))
    );
    const btn = (key, label) => ({
      label, key, active: r.decision === key,
      onClick: () => decideStaged(r.id, key)
    });
    return {
      id: r.id,
      date: r.booking_date,
      title: r.counterparty_name || r.remittance || 'Bank transaction',
      detail: r.counterparty_name && r.remittance && r.remittance !== r.counterparty_name ? r.remittance : '',
      account: a ? a.name : '—',
      accountIcon: '#' + (a ? a.icon : 'ic-wallet'),
      amount: money(isOut ? -r.amount : r.amount, !isOut),
      amountColor: isOut ? RED : GREEN,
      typeLabel: isTransfer ? ('Transfer → ' + (other ? other.name : '?')) : (isOut ? 'Expense' : 'Income'),
      isTransfer,
      // The two banks either side of one transfer both report it; the queue
      // says so explicitly rather than quietly hiding one of the rows.
      pairNote: r.pair_id ? 'Both banks reported this transfer — it will be imported once.' : '',
      showCategory: !isTransfer,
      catOptions,
      category: r.category_id || '',
      onCategory: e => setStagedField(r.id, { category_id: e.target.value ? +e.target.value : null }),
      // A suspected duplicate is described, never acted on. The candidate is
      // spelled out so the decision is the user's to make on the evidence.
      hasMatch: !!r.match,
      matchText: r.match
        ? `${r.match.date} · ${money(r.match.amount)}${r.match.note ? ' · ' + r.match.note : ''}${r.match.category ? ' · ' + r.match.category : ''}`
        : '',
      matchReason: r.match_reason || '',
      decision: r.decision,
      decided: r.decision !== 'pending',
      buttons: [btn('import', 'Import'), ...(r.match ? [btn('link', 'Already have it')] : []), btn('skip', "Don't import")]
    };
  });

  const bankConnections = (s.bank.connections || []).filter(c => c.status === 'active').map(c => {
    const until = c.valid_until ? new Date(c.valid_until) : null;
    const daysLeft = until ? Math.ceil((until - new Date()) / 86400000) : null;
    return {
      name: c.aspsp_name, country: c.aspsp_country,
      // A consent lapses after about 90 days and the bank then refuses to
      // answer, so the countdown is shown before it bites rather than after.
      expiry: daysLeft === null ? '' : daysLeft > 0 ? `access expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'access has expired — reconnect',
      expiring: daysLeft !== null && daysLeft <= 7
    };
  });

  const stagedPending = s.staged.filter(r => r.decision === 'pending').length;
  const stagedReady = s.staged.filter(r => r.decision !== 'pending').length;
  const stagedFlagged = s.staged.filter(r => r.decision === 'pending' && r.match_tx_id).length;

  const deleteAccountTarget = s.modal === 'deleteAccount' ? acct(s.editId) : null;
  const deleteRecurringTarget = s.modal === 'deleteRecurring' ? s.recurring.find(r => r.id === s.editId) : null;
  const deleteMovementTarget = s.modal === 'deleteMovement' ? s.tx.find(t => t.id === s.editId) : null;
  const extraPaymentTarget = s.modal === 'extraPayment' ? acct(s.editId) : null;

  return {
    isNarrow: s.narrow, isWide: !s.narrow,
    pageTint: TH.tint[s.page] || TH.tint.accounts,
    spendableBalance: money(spendable), totalBalance: money(total),
    periodTitle: P.title, periodRange: dm(P.start) + ' – ' + dm(P.end),
    mode: s.mode,
    navItems: nav.map(p => {
      const on = s.page === p[0];
      return {
        label: p[1], icon: '#' + p[2], onClick: () => { s.page = p[0]; render(); },
        color: on ? ACCENT : GREY, weight: on ? '600' : '400',
        underline: on ? ACCENT : 'transparent', pill: on ? TH.accentSoft : 'transparent'
      };
    }),
    summaryCells: cells,
    isAccounts: s.page === 'accounts', isCategories: s.page === 'categories', isBalance: s.page === 'balance',
    isOverview: s.page === 'overview', isBudget: s.page === 'budget', isImport: s.page === 'import',
    importRows, importFeeds, noStaged: importRows.length === 0, noFeeds: importFeeds.length === 0,
    stagedPending, stagedReady, stagedFlagged,
    importBusy: s.importBusy, importMsg: s.importMsg,
    bankConfigured: !!s.bank.configured, bankConnections, syncDays: s.syncDays,
    syncDayOptions: [['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']],
    isConnectBankModal: s.modal === 'connectBank',
    aspspLoading: s.aspspLoading,
    aspspCountry: s.aspspCountry,
    aspspCountryOptions: [['NL', 'Netherlands'], ['IT', 'Italy'], ['DE', 'Germany'], ['BE', 'Belgium'], ['FR', 'France'], ['ES', 'Spain']],
    onAspspCountry: e => { s.aspspCountry = e.target.value; loadAspsps(); },
    aspspList: s.aspsps.map(b => ({
      name: b.name, country: b.country,
      onClick: () => connectBankAction(b.name, b.country)
    })),
    showRecurringTab: s.page === 'balance' && s.balanceTab === 'recurring',
    balanceTabs: [['movements', 'Movements'], ['recurring', 'Recurring']].map(t => {
      const on = s.balanceTab === t[0];
      return { label: t[1], value: t[0], underline: on ? ACCENT : 'transparent', color: on ? ACCENT : GREY, weight: on ? '600' : '500', onClick: () => { s.balanceTab = t[0]; render(); } };
    }),
    accountGroups, closedAccounts, recurringRows, noRecurring: recurringRows.length === 0,
    donut, donutLabel: s.view === 'income' ? 'Income' : 'Expenses', donutTotal: short(donutBase),
    legend, catSections,
    filtersOpen: s.filtersOpen,
    filterGroups, filterCount: fCount ? '(' + fCount + ')' : '',
    filterBorder: fCount ? ACCENT : TH.border, filterColor: fCount ? ACCENT : GREY,
    dayGroups, noRows: rows.length === 0,
    movementSummary: rows.length + ' movements · net ' + money(rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0), true),
    spendChartTitle,
    axis, bars, barGap: bars.length > 20 ? '2px' : bars.length > 10 ? '5px' : '12px',
    netWorthTrend, hasLoanPayoff: !!loanPayoffTrend, loanPayoffTrend: loanPayoffTrend || {},
    dashboardAccounts, budgetWatch, topExpenseCats, topIncomeCats, insight, recentTx,
    globalBg: gOver ? '#fdecea' : TH.surface, globalTrack: gOver ? '#f6cfcb' : TH.border,
    globalColor: gOver ? RED : ACCENT, globalPct: Math.round(gPct) + '%',
    globalWidth: Math.min(100, gPct) + '%', globalSpent: money(gSp), globalLimit: money(gLim),
    globalRemaining: gOver ? money(gSp - gLim) + ' over' : money(gLim - gSp) + ' left',
    budgetRows, noBudgets: budgetRows.length === 0,
    unbudgeted: unbudgeted().map(c => ({
      name: c.name, color: c.color, icon: '#' + c.icon, spent: money(T.byCat[c.id] || 0),
      onClick: () => openModal('budget', null, { category: c.id, limit: String(Math.max(50, Math.round((T.byCat[c.id] || 100) / M / 10) * 10)) })
    })),
    drawerOpen: s.drawerOpen,
    drawerItems: [
      { label: 'Data', icon: '#ic-db', onClick: () => openModal('data') },
      { label: 'Backups', icon: '#ic-refresh', onClick: () => openModal('backups') },
      { label: 'About', icon: '#ic-info', onClick: () => openAboutModal() }
    ],
    showModal: !!s.modal, isMovementModal: s.modal === 'movement', isAccountModal: s.modal === 'account',
    isCatModal: s.modal === 'category', isBudgetModal: s.modal === 'budget', isSettingsModal: s.modal === 'settings',
    isDeleteAccountModal: s.modal === 'deleteAccount',
    deleteAccountName: deleteAccountTarget ? deleteAccountTarget.name : '',
    deleteAccountMovCount: deleteAccountTarget ? s.tx.filter(t => t.account_id === deleteAccountTarget.id || t.to_account_id === deleteAccountTarget.id).length : 0,
    isRecurringModal: s.modal === 'recurring', isDeleteRecurringModal: s.modal === 'deleteRecurring',
    deleteRecurringName: deleteRecurringTarget ? deleteRecurringTarget.name : '',
    deleteRecurringPaused: deleteRecurringTarget ? !deleteRecurringTarget.active : false,
    deleteRecurringTxCount: deleteRecurringTarget ? s.tx.filter(t => t.recurring_id === deleteRecurringTarget.id).length : 0,
    isDeleteMovementModal: s.modal === 'deleteMovement',
    deleteMovementTitle: deleteMovementTarget ? (cat(deleteMovementTarget.category_id) ? cat(deleteMovementTarget.category_id).name : (deleteMovementTarget.type.indexOf('Transfer') >= 0 ? 'Transfer' : deleteMovementTarget.type)) : '',
    deleteMovementAmount: deleteMovementTarget ? money(deleteMovementTarget.type === 'Expense' ? -deleteMovementTarget.amount : deleteMovementTarget.amount, deleteMovementTarget.type === 'Income') : '',
    isDeleteAllDataModal: s.modal === 'deleteAllData', isChangePasswordModal: s.modal === 'changePassword',
    formDangerPassword: s.form.dangerPassword, formDangerConfirm: s.form.dangerConfirm,
    formCurrentPassword: s.form.currentPassword, formNewPassword: s.form.newPassword, formConfirmNewPassword: s.form.confirmNewPassword,
    isDataModal: s.modal === 'data', isBackupsModal: s.modal === 'backups', isAboutModal: s.modal === 'about',
    formBackupFileName: s.form.backupFileName, formBackupPassword: s.form.backupPassword, formBackupConfirm: s.form.backupConfirm,
    appVersion: APP_VERSION, swInfo: s.swInfo,
    isExtraPaymentModal: s.modal === 'extraPayment',
    extraPaymentAccountName: extraPaymentTarget ? extraPaymentTarget.name : '',
    extraPaymentOwed: extraPaymentTarget ? money(Math.max(0, -extraPaymentTarget.balance)) : '',
    formExtraPaymentAmount: s.form.extraPaymentAmount, formExtraPaymentDate: s.form.extraPaymentDate,
    formExtraPaymentFrom: s.form.extraPaymentFrom,
    extraPaymentFromOptions: s.accounts.filter(a => (a.grp === 'spend' || a.grp === 'save') && a.active).map(a => ({ v: a.id, l: a.name })),
    modalTitle: modalMeta[0], modalCta: modalMeta[1],
    movementTabs: [['Expense', 'Expenses'], ['Income', 'Income'], ['Transfer internal', 'Transfer']].map(t => {
      const on = s.form.movement === t[0];
      return { label: t[1], value: t[0], underline: on ? ACCENT : 'transparent', color: on ? ACCENT : GREY, weight: on ? '600' : '500' };
    }),
    movementKind: s.form.movement, todayLabel: DAYS[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MONTHS[new Date().getMonth()].toUpperCase() + ' ' + new Date().getFullYear(),
    isTransferMovement: s.form.movement === 'Transfer internal',
    movementCats: s.cats.filter(c => c.kind === (s.form.movement === 'Income' ? 'income' : 'expense')).map(c => ({
      id: c.id, name: c.name, icon: '#' + c.icon, bg: c.color, color: '#fff',
      opacity: s.form.category === c.id ? '1' : '0.55'
    })),
    accountOptions: s.accounts.filter(a => a.active).map(a => ({ v: a.id, l: a.name + ' · ' + money(a.balance) })),
    toAccountOptions: s.accounts.filter(a => a.active && a.id !== s.form.account).map(a => ({ v: a.id, l: a.name })),
    formAmount: s.form.amount, formAccount: s.form.account, formToAccount: s.form.toAccount, formNote: s.form.note,
    accountKinds: [['spend', 'Account', 'ic-wallet'], ['save', 'Savings account', 'ic-piggy'], ['credit', 'Credit card', 'ic-card'], ['loan', 'Loan', 'ic-bank']].map(k => ({
      value: k[0], label: k[1], icon: '#' + k[2],
      ring: s.form.kind === k[0] ? ACCENT : TH.border, dot: s.form.kind === k[0] ? ACCENT : 'transparent'
    })),
    isSavingsKind: s.form.kind === 'save', isCreditKind: s.form.kind === 'credit', isLoanKind: s.form.kind === 'loan',
    showIban: s.form.kind !== 'credit' && s.form.kind !== 'loan' && (s.form.kind === 'save' || s.form.type === 'Bank'),
    balanceLabel: s.form.kind === 'credit' ? 'Current balance owed (optional)' : s.form.kind === 'loan' ? 'Current amount owed' : 'Initial balance',
    goalLabel: s.form.kind === 'credit' ? 'Credit limit (optional)' : s.form.kind === 'loan' ? 'Original loan amount (optional)' : 'Savings goal',
    formAutopayEnabled: s.form.autopayEnabled, formAutopayFrom: s.form.autopayFrom,
    formAutopayDay: s.form.autopayDay, formAutopayWeekendRule: s.form.autopayWeekendRule,
    autopayFromOptions: s.accounts.filter(a => a.grp === 'spend' && a.active && a.id !== s.editId).map(a => ({ v: a.id, l: a.name })),
    autopayDayOptions: Array.from({ length: 31 }, (_, i) => i + 1).map(n => ({ v: String(n), l: String(n) })),
    formLoanFrom: s.form.loanFrom, formLoanRate: s.form.loanRate, formLoanTermMonths: s.form.loanTermMonths,
    formLoanCategory: s.form.loanCategory, formLoanDay: s.form.loanDay, formLoanWeekendRule: s.form.loanWeekendRule,
    loanFromOptions: s.accounts.filter(a => a.grp === 'spend' && a.active && a.id !== s.editId).map(a => ({ v: a.id, l: a.name })),
    loanCategoryOptions: s.cats.filter(c => c.kind === 'expense').map(c => ({ v: c.id, l: c.name })),
    formIban: s.form.iban, formError: s.formError,
    recurTypeTabs: [['Expense', 'Expense'], ['Income', 'Income'], ['Transfer internal', 'Transfer']].map(t => {
      const on = s.form.recurMovement === t[0];
      return { label: t[1], value: t[0], underline: on ? ACCENT : 'transparent', color: on ? ACCENT : GREY, weight: on ? '600' : '500' };
    }),
    isRecurTransfer: s.form.recurMovement === 'Transfer internal',
    recurCats: s.cats.filter(c => c.kind === (s.form.recurMovement === 'Income' ? 'income' : 'expense')).map(c => ({ v: c.id, l: c.name })),
    freqOptions: [
      ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly'],
      ['monthly_nth_business_day', 'Nth business day of the month']
    ].map(f => ({ v: f[0], l: f[1] })),
    formFreq: s.form.freq,
    isFreqWeekly: s.form.freq === 'weekly', isFreqMonthly: s.form.freq === 'monthly',
    isFreqYearly: s.form.freq === 'yearly', isFreqNthBiz: s.form.freq === 'monthly_nth_business_day',
    showWeekendRule: ['daily', 'weekly', 'monthly', 'yearly'].indexOf(s.form.freq) >= 0,
    formIntervalN: s.form.intervalN,
    intervalUnit: { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)', monthly_nth_business_day: 'month(s)' }[s.form.freq] || '',
    weekdayOptions: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((l, i) => ({ v: i, l })),
    formWeekday: s.form.weekday,
    formDayOfMonth: s.form.dayOfMonth,
    monthOptions: MONTHS.map((l, i) => ({ v: i + 1, l })),
    formMonthOfYear: s.form.monthOfYear,
    nthBizOptions: [['1', 'First business day'], ['2', '2nd business day'], ['3', '3rd business day'], ['-1', 'Last business day'], ['-2', '2nd-to-last business day'], ['-3', '3rd-to-last business day']].map(o => ({ v: o[0], l: o[1] })),
    formNthBusinessDay: s.form.nthBusinessDay,
    weekendRuleOptions: [['none', "Don't shift"], ['before', 'Move earlier (before the weekend)'], ['after', 'Move later (after the weekend)']].map(o => ({ v: o[0], l: o[1] })),
    formWeekendRule: s.form.weekendRule,
    formStartDate: s.form.startDate, formEndDate: s.form.endDate, formNoEnd: s.form.noEnd,
    formName: s.form.name, formType: s.form.type, formBalance: s.form.balance, formGoal: s.form.goal,
    formColor: s.form.color, formIconRef: '#' + s.form.icon,
    iconChoices: ICONS.map(i => ({
      value: i, ref: '#' + i,
      border: s.form.icon === i ? s.form.color : TH.border,
      bg: s.form.icon === i ? s.form.color : TH.surface,
      fg: s.form.icon === i ? '#fff' : GREY
    })),
    colorChoices: PAL.map(c => ({ value: c, ring: s.form.color === c ? TH.text : 'transparent' })),
    canDelete: !!s.editId,
    formCategory: s.form.category, formLimit: s.form.limit,
    budgetCatOptions: (s.editId ? [cat(s.editId)] : unbudgeted()).filter(Boolean).map(c => ({ v: c.id, l: c.name })),
    budgetHint: 'Monthly limit. For ' + P.title.toLowerCase() + ' it is compared against ' + M + ' month' + (M > 1 ? 's' : '') + ' of spending.',
    canRemoveBudget: !!s.editId
  };
}
