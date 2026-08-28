'use strict';

// ---------- constants ----------
const RED = '#d93a34', GREEN = '#2f9e44', GREY = '#6b7280', BLUE = '#3b5bdb';
const ACCENT = BLUE;
const PAL = ['#1f6fd0', '#e03b34', '#4caf50', '#f4703a', '#12897f', '#f2a25c', '#7048c8', '#b6d334', '#5b46b8', '#26aee8', '#ef5b8c', '#e8a33d', '#a531b5', '#c0173f', '#8b6ce0'];
const ICONS = ['ic-cart', 'ic-fork', 'ic-car', 'ic-bag', 'ic-health', 'ic-home', 'ic-play', 'ic-dots', 'ic-salary', 'ic-refresh', 'ic-gift', 'ic-star', 'ic-bank', 'ic-wallet', 'ic-cash', 'ic-piggy', 'ic-transfer', 'ic-receipt'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ---------- state ----------
const state = {
  authed: false, loginError: '',
  accounts: [], cats: [], tx: [], budgets: {},
  page: 'accounts', mode: 'month', anchor: new Date(), view: 'expenses',
  fAccounts: [], fTypes: [], fCats: [], filtersOpen: false, expanded: null,
  narrow: window.matchMedia('(max-width: 859px)').matches,
  drawerOpen: false, modal: null, editId: null,
  form: { name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: '', toAccount: '', icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense' }
};

// ---------- api ----------
async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (res.status === 401) { state.authed = false; render(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

async function loadAll() {
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

// ---------- helpers ported from the design ----------
function money(v, plus) {
  const s = Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : plus && v > 0 ? '+' : '') + s + ' €';
}
function short(v) { return Math.round(v).toLocaleString('de-DE') + ' €'; }
function num(v) { return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0; }
function dm(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
function cat(id) { return state.cats.find(c => c.id === id); }
function acct(id) { return state.accounts.find(a => a.id === id); }
function set(k, v) { state.form[k] = v; }

function period() {
  const a = state.anchor;
  if (state.mode === 'week') {
    const start = new Date(a); start.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end, title: 'WEEK ' + dm(start) };
  }
  if (state.mode === 'month') return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 0), title: MONTHS[a.getMonth()].toUpperCase() + ' ' + a.getFullYear() };
  if (state.mode === 'quarter') { const q = Math.floor(a.getMonth() / 3) * 3; return { start: new Date(a.getFullYear(), q, 1), end: new Date(a.getFullYear(), q + 3, 0), title: 'Q' + (q / 3 + 1) + ' ' + a.getFullYear() }; }
  return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31), title: 'YEAR ' + a.getFullYear() };
}
function shiftPeriod(dir) {
  const a = new Date(state.anchor);
  if (state.mode === 'week') a.setDate(a.getDate() + 7 * dir);
  else if (state.mode === 'month') a.setMonth(a.getMonth() + dir);
  else if (state.mode === 'quarter') a.setMonth(a.getMonth() + 3 * dir);
  else a.setFullYear(a.getFullYear() + dir);
  state.anchor = a;
}
function months() { const p = period(); return Math.max(1, Math.round((p.end - p.start) / 86400000 / 30.4)); }
function scoped() { const p = period(); return state.tx.filter(t => t._date >= p.start && t._date <= p.end); }
function totals() {
  const rows = scoped(), byCat = {}, counts = {};
  let exp = 0, inc = 0;
  rows.forEach(t => {
    if (t.type === 'Expense') exp += t.amount; else if (t.type === 'Income') inc += t.amount; else return;
    byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount;
    counts[t.category_id] = (counts[t.category_id] || 0) + 1;
  });
  return { rows, byCat, counts, exp, inc };
}
function unbudgeted() { return state.cats.filter(c => c.kind === 'expense' && state.budgets[c.id] === undefined); }
function toggle(key, id) {
  const arr = state[key];
  state[key] = arr.indexOf(id) < 0 ? arr.concat([id]) : arr.filter(x => x !== id);
}
function openModal(kind, editId, form) {
  state.modal = kind; state.editId = editId || null; state.drawerOpen = false;
  state.form = Object.assign({ name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: state.accounts[0] ? state.accounts[0].id : '', toAccount: '', icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense' }, form || {});
  render();
}

// ---------- mutations (call the API, then reload + render) ----------
async function submit() {
  const f = state.form;
  if (state.modal === 'account') {
    const isSave = f.kind === 'save';
    const body = {
      name: f.name.trim() || 'New account',
      type: isSave ? 'Savings' : f.type,
      icon: isSave ? 'ic-piggy' : (f.type === 'Cash' ? 'ic-cash' : f.type === 'Wallet' ? 'ic-wallet' : 'ic-bank'),
      color: isSave ? '#40c057' : PAL[state.accounts.length % PAL.length],
      grp: isSave ? 'save' : 'spend',
      starting_balance: num(f.balance),
      goal_amount: isSave && num(f.goal) > 0 ? num(f.goal) : null
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
    const amt = num(f.amount);
    if (!amt) { state.modal = null; render(); return; }
    const isTransfer = f.movement === 'Transfer internal';
    const body = {
      date: new Date().toISOString().slice(0, 10),
      account_id: f.account,
      to_account_id: isTransfer && f.toAccount ? f.toAccount : null,
      type: f.movement,
      category_id: (f.movement === 'Expense' || f.movement === 'Income') ? (f.category || null) : null,
      amount: amt
    };
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
    state.page = 'balance';
  }
  state.modal = null;
  await loadAll();
  render();
}
async function deleteCategoryAction() {
  await api('/api/categories/' + state.editId, { method: 'DELETE' });
  state.modal = null;
  await loadAll();
  render();
}
async function removeBudgetAction() {
  await api('/api/budgets/' + state.editId, { method: 'DELETE' });
  state.modal = null;
  await loadAll();
  render();
}

// ---------- event delegation ----------
let handlers = [];
function H(fn) { handlers.push(fn); return handlers.length - 1; }
function wire(root) {
  root.querySelectorAll('[data-click]').forEach(el => {
    el.addEventListener('click', e => { handlers[+el.dataset.click](e); });
  });
  root.querySelectorAll('[data-change]').forEach(el => {
    el.addEventListener('change', e => { handlers[+el.dataset.change](e); });
  });
  root.querySelectorAll('[data-input]').forEach(el => {
    el.addEventListener('input', e => { handlers[+el.dataset.input](e); });
  });
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- view model (ported from the design's renderVals()) ----------
function computeView() {
  const s = state, P = period(), T = totals(), M = months();
  const spendable = s.accounts.filter(a => a.grp === 'spend').reduce((x, a) => x + a.balance, 0);
  const total = s.accounts.reduce((x, a) => x + a.balance, 0);
  const saldo = T.inc - T.exp;
  const expView = s.view === 'expenses';

  const nav = [['accounts', 'Accounts', 'ic-coins'], ['categories', 'Categories', 'ic-donut'], ['balance', 'Movements', 'ic-receipt'], ['overview', 'Overview', 'ic-bars'], ['budget', 'Budget', 'ic-gauge']];
  const PAGE_TINT = {
    accounts: 'linear-gradient(180deg,#e9f1ff 0%,#eef0f3 260px)',
    categories: 'linear-gradient(180deg,#f4ecff 0%,#eef0f3 260px)',
    balance: 'linear-gradient(180deg,#e8faf0 0%,#eef0f3 260px)',
    overview: 'linear-gradient(180deg,#fff3e6 0%,#eef0f3 260px)',
    budget: 'linear-gradient(180deg,#e6faf7 0%,#eef0f3 260px)'
  };

  let cells;
  if (s.page === 'accounts') {
    cells = [
      { label: 'Spendable', value: money(spendable), color: '#1b1f26' },
      { label: 'Savings', value: money(total - spendable), color: GREEN },
      { label: 'Net worth', value: money(total), color: '#1b1f26' }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'balance') {
    const net = T.rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0);
    cells = [
      { label: 'Start balance', value: money(total - net), color: GREY },
      { label: 'Change', value: money(net, true), color: net < 0 ? RED : GREEN },
      { label: 'End balance', value: money(total), color: '#1b1f26' }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else {
    const sel = k => s.view === k;
    cells = [
      { key: 'expenses', label: s.page === 'budget' ? 'Budget EXPENSES' : 'Expenses', value: money(T.exp), color: RED },
      { key: 'saldo', label: 'Saldo', value: money(saldo, true), color: saldo < 0 ? RED : GREEN },
      { key: 'income', label: s.page === 'budget' ? 'Budget INCOME' : 'Income', value: money(T.inc), color: GREEN }
    ].map(c => Object.assign(c, {
      labelColor: sel(c.key) ? '#1b1f26' : GREY, weight: sel(c.key) ? '700' : '500',
      underline: sel(c.key) ? c.color : 'transparent', cursor: 'pointer',
      onClick: () => { s.view = c.key; render(); }
    }));
  }

  const accountGroups = [
    { key: 'spend', title: 'Accounts' }, { key: 'save', title: 'Savings accounts' }
  ].map(g => {
    const items = s.accounts.filter(a => a.grp === g.key);
    return {
      title: g.title, total: money(items.reduce((x, a) => x + a.balance, 0)),
      items: items.map(a => {
        const own = s.tx.filter(t => t.account_id === a.id);
        return {
          name: a.name, type: a.type, icon: '#' + a.icon, color: a.color, balance: money(a.balance),
          hasGoal: !!a.goal_amount, goalPct: a.goal_amount ? Math.min(100, a.balance / a.goal_amount * 100) + '%' : '0%',
          goalLabel: a.goal_amount ? Math.round(a.balance / a.goal_amount * 100) + '% of ' + short(a.goal_amount) : '',
          meta: own.length ? own.length + ' mov.' : 'new',
          onClick: () => { s.page = 'balance'; s.fAccounts = [a.id]; s.filtersOpen = true; render(); }
        };
      })
    };
  }).filter(g => g.items.length);

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
      budgetColor: lim ? (t > lim ? RED : GREY) : '#a9b0bb',
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
      icon: '#' + (c ? c.icon : 'ic-transfer'), color: c ? c.color : '#8b93a1',
      account: a ? a.name : '—', accountIcon: '#' + (a ? a.icon : 'ic-wallet'),
      amount: money(isExp ? -t.amount : t.amount, isInc), type: t.type,
      amountColor: isExp ? RED : isInc ? GREEN : GREY
    });
  });
  const dayGroups = groups.map(g => ({
    day: g.date.getDate(), weekday: DAYS[g.date.getDay()], month: MONTHS[g.date.getMonth()].toUpperCase() + ' ' + g.date.getFullYear(),
    net: money(g.net, true), netColor: g.net < 0 ? RED : g.net > 0 ? GREEN : GREY, items: g.items
  }));
  const chip = (label, icon, color, active, onClick) => ({
    label, icon: '#' + icon, onClick, active,
    border: active ? color : '#e0e3e9', bg: active ? color + '14' : '#fff', color: active ? color : '#5c6473'
  });
  const filterGroups = [
    { title: 'Movement type', items: [['Income', 'ic-salary', GREEN], ['Expense', 'ic-cart', RED], ['Transfer internal', 'ic-transfer', BLUE], ['Transfer external', 'ic-transfer', '#7b8494']].map(t => chip(t[0], t[1], t[2], s.fTypes.indexOf(t[0]) >= 0, () => { toggle('fTypes', t[0]); render(); })) },
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
  const axis = [4, 3, 2, 1, 0].map(i => Math.round(peak * i / 4).toLocaleString('de-DE'));
  const bars = buckets.map(b => ({
    label: b.label, height: Math.max(0.5, b.total / peak * 100) + '%', tip: b.full + ' · ' + money(b.total),
    segments: Object.keys(b.byCat).sort((x, y) => b.byCat[y] - b.byCat[x]).map(id => {
      const c = cat(+id);
      return { h: (b.byCat[id] / b.total * 100) + '%', color: c ? c.color : '#9aa1ad' };
    })
  }));
  const spanDays = Math.max(1, Math.round((Math.min(P.end, new Date()) - P.start) / 86400000) + 1);
  const chartTotal = chartTx.reduce((a, t) => a + t.amount, 0);
  const avgColor = expView ? RED : GREEN;
  const averages = [
    { label: 'Day (avg)', value: money(chartTotal / spanDays), color: avgColor },
    { label: 'Week (avg)', value: money(chartTotal / spanDays * 7), color: avgColor },
    { label: 'Month (avg)', value: money(chartTotal / spanDays * 30.4), color: avgColor }
  ];
  const ranking = s.cats.filter(c => c.kind === (expView ? 'expense' : 'income'))
    .map(c => ({ c, v: T.byCat[c.id] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
    .map(x => {
      const open = s.expanded === x.c.id;
      const detail = T.rows.filter(t => t.category_id === x.c.id).slice(0, 5).map(t => ({
        left: dm(t._date).slice(0, 5) + ' · ' + (acct(t.account_id) || {}).name, right: money(t.amount)
      }));
      return {
        name: x.c.name, count: '(' + (T.counts[x.c.id] || 0) + ')', color: x.c.color, icon: '#' + x.c.icon,
        amount: money(x.v), amountColor: expView ? RED : GREEN,
        pct: Math.round(x.v / (chartTotal || 1) * 100) + '%', width: (x.v / (chartTotal || 1) * 100) + '%',
        chevron: open ? '#ic-up' : '#ic-down', open, detail,
        onClick: () => { s.expanded = open ? null : x.c.id; render(); }
      };
    });

  const bIds = Object.keys(s.budgets).map(Number).filter(id => cat(id));
  const budgetRows = bIds.map(id => {
    const c = cat(id), lim = s.budgets[id] * M, sp = T.byCat[id] || 0, pct = sp / lim * 100;
    const col = pct > 100 ? RED : pct > 85 ? '#e8890c' : ACCENT;
    return {
      name: c.name, color: c.color, icon: '#' + c.icon, spent: money(sp), limit: money(lim),
      pct: Math.round(pct) + '%', width: Math.min(100, pct) + '%', barColor: col,
      left: pct > 100 ? money(sp - lim) + ' over' : money(lim - sp) + ' left',
      onClick: () => openModal('budget', id, { category: id, limit: String(s.budgets[id]) })
    };
  }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));
  const gLim = bIds.reduce((a, id) => a + s.budgets[id] * M, 0);
  const gSp = bIds.reduce((a, id) => a + (T.byCat[id] || 0), 0);
  const gPct = gLim ? gSp / gLim * 100 : 0;
  const gOver = gPct > 100;

  const modalMeta = {
    movement: ['New movement', 'Save'], account: ['New account', 'Save'],
    category: [s.editId ? 'Edit category' : 'New category', 'Apply'],
    budget: [s.editId ? 'Edit budget' : 'Set budget', 'Save']
  }[s.modal] || ['', ''];

  return {
    isNarrow: s.narrow, isWide: !s.narrow,
    pageTint: PAGE_TINT[s.page] || PAGE_TINT.accounts,
    spendableBalance: money(spendable), totalBalance: money(total),
    periodTitle: P.title, periodRange: dm(P.start) + ' – ' + dm(P.end),
    mode: s.mode,
    navItems: nav.map(p => {
      const on = s.page === p[0];
      return {
        label: p[1], icon: '#' + p[2], onClick: () => { s.page = p[0]; s.expanded = null; render(); },
        color: on ? ACCENT : '#6b7280', weight: on ? '600' : '400',
        underline: on ? ACCENT : 'transparent', pill: on ? '#e7ebfd' : 'transparent'
      };
    }),
    summaryCells: cells,
    isAccounts: s.page === 'accounts', isCategories: s.page === 'categories', isBalance: s.page === 'balance',
    isOverview: s.page === 'overview', isBudget: s.page === 'budget',
    accountGroups,
    donut, donutLabel: s.view === 'income' ? 'Income' : 'Expenses', donutTotal: short(donutBase),
    legend, catSections,
    filtersOpen: s.filtersOpen,
    filterGroups, filterCount: fCount ? '(' + fCount + ')' : '',
    filterBorder: fCount ? ACCENT : '#dfe3ea', filterColor: fCount ? ACCENT : '#3a4150',
    dayGroups, noRows: rows.length === 0,
    movementSummary: rows.length + ' movements · net ' + money(rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0), true),
    axis, bars, barGap: bars.length > 20 ? '2px' : bars.length > 10 ? '5px' : '12px', averages, ranking,
    globalBg: gOver ? '#fdecea' : '#fff', globalTrack: gOver ? '#f6cfcb' : '#eceef2',
    globalColor: gOver ? RED : ACCENT, globalPct: Math.round(gPct) + '%',
    globalWidth: Math.min(100, gPct) + '%', globalSpent: money(gSp), globalLimit: money(gLim),
    globalRemaining: gOver ? money(gSp - gLim) + ' over' : money(gLim - gSp) + ' left',
    budgetRows, noBudgets: budgetRows.length === 0,
    unbudgeted: unbudgeted().map(c => ({
      name: c.name, color: c.color, icon: '#' + c.icon, spent: money(T.byCat[c.id] || 0),
      onClick: () => openModal('budget', null, { category: c.id, limit: String(Math.max(50, Math.round((T.byCat[c.id] || 100) / M / 10) * 10)) })
    })),
    drawerOpen: s.drawerOpen,
    drawerItems: [{ label: 'Settings', icon: '#ic-gear' }, { label: 'Data', icon: '#ic-db' }, { label: 'About', icon: '#ic-info' }],
    showModal: !!s.modal, isMovementModal: s.modal === 'movement', isAccountModal: s.modal === 'account',
    isCatModal: s.modal === 'category', isBudgetModal: s.modal === 'budget',
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
    accountOptions: s.accounts.map(a => ({ v: a.id, l: a.name + ' · ' + money(a.balance) })),
    toAccountOptions: s.accounts.filter(a => a.id !== s.form.account).map(a => ({ v: a.id, l: a.name })),
    formAmount: s.form.amount, formAccount: s.form.account, formToAccount: s.form.toAccount,
    accountKinds: [['spend', 'Account', 'ic-wallet'], ['save', 'Savings account', 'ic-piggy']].map(k => ({
      value: k[0], label: k[1], icon: '#' + k[2],
      ring: s.form.kind === k[0] ? ACCENT : '#c8cdd6', dot: s.form.kind === k[0] ? ACCENT : 'transparent'
    })),
    isSavingsKind: s.form.kind === 'save',
    formName: s.form.name, formType: s.form.type, formBalance: s.form.balance, formGoal: s.form.goal,
    formColor: s.form.color, formIconRef: '#' + s.form.icon,
    iconChoices: ICONS.map(i => ({
      value: i, ref: '#' + i,
      border: s.form.icon === i ? s.form.color : '#e6e9ee',
      bg: s.form.icon === i ? s.form.color : '#fff',
      fg: s.form.icon === i ? '#fff' : '#5c6473'
    })),
    colorChoices: PAL.map(c => ({ value: c, ring: s.form.color === c ? '#1b1f26' : 'transparent' })),
    canDelete: !!s.editId,
    formCategory: s.form.category, formLimit: s.form.limit,
    budgetCatOptions: (s.editId ? [cat(s.editId)] : unbudgeted()).filter(Boolean).map(c => ({ v: c.id, l: c.name })),
    budgetHint: 'Monthly limit. For ' + P.title.toLowerCase() + ' it is compared against ' + M + ' month' + (M > 1 ? 's' : '') + ' of spending.',
    canRemoveBudget: !!s.editId
  };
}

// ---------- rendering ----------
function render() {
  handlers = [];
  const root = document.getElementById('root');
  root.innerHTML = state.authed ? renderApp() : renderLogin();
  wire(root);
  const amountInput = root.querySelector('#f-amount');
  if (amountInput) amountInput.addEventListener('input', e => set('amount', e.target.value));
  const nameInput = root.querySelector('#f-name');
  if (nameInput) nameInput.addEventListener('input', e => set('name', e.target.value));
  const balanceInput = root.querySelector('#f-balance');
  if (balanceInput) balanceInput.addEventListener('input', e => set('balance', e.target.value));
  const goalInput = root.querySelector('#f-goal');
  if (goalInput) goalInput.addEventListener('input', e => set('goal', e.target.value));
  const limitInput = root.querySelector('#f-limit');
  if (limitInput) limitInput.addEventListener('input', e => set('limit', e.target.value));
  const pwInput = root.querySelector('#f-password');
  if (pwInput) pwInput.focus();
}

function renderLogin() {
  return `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
    <form id="login-form" style="background:#fff;border-radius:20px;padding:28px 26px;width:100%;max-width:340px;box-shadow:0 8px 30px rgba(16,24,40,0.12);display:flex;flex-direction:column;gap:14px">
      <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;color:#1b1f26;display:grid;place-items:center;font-weight:700;font-size:24px;margin:0 auto">K</span>
      <span style="font-weight:700;font-size:20px;text-align:center">MerlitoMoney</span>
      <input id="f-password" type="password" placeholder="Password" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;font-size:15px;outline:none" autofocus>
      ${state.loginError ? `<span style="color:${RED};font-size:13px">${esc(state.loginError)}</span>` : ''}
      <button type="submit" style="border:0;background:${BLUE};color:#fff;border-radius:12px;padding:12px;cursor:pointer;font-weight:600;font-size:15px">Log in</button>
    </form>
  </div>`;
}

function iconBtn(V, ariaLabel, iconId, size, onClick, extraStyle) {
  return `<button data-click="${H(onClick)}" aria-label="${ariaLabel}" style="border:0;background:transparent;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#3a4150;flex:none${extraStyle || ''}"><svg width="${size}" height="${size}"><use href="#${iconId}"></use></svg></button>`;
}

function renderApp() {
  const V = computeView();

  const header = `
  <header style="position:sticky;top:0;z-index:30;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,0.07)">
    <div style="display:flex;align-items:center;gap:8px;padding:10px clamp(10px,2.4vw,20px)">
      ${iconBtn(V, 'Menu', 'ic-menu', 22, () => { state.drawerOpen = !state.drawerOpen; render(); })}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0">
        <span style="font-size:12px;color:#6b7280">Accounts balance</span>
        <span style="font-size:clamp(20px,3.4vw,26px);font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">${V.spendableBalance}</span>
        <span style="font-size:12px;color:#2f9e44;font-variant-numeric:tabular-nums">Total ${V.totalBalance}</span>
      </div>
      ${iconBtn(V, 'New movement', 'ic-plus', 22, () => openModal('movement', null, { movement: 'Expense', category: (state.cats.find(c => c.kind === 'expense') || {}).id || '', account: state.accounts[0] ? state.accounts[0].id : '' }))}
      ${iconBtn(V, 'Search', 'ic-search', 20, () => { state.page = 'balance'; state.filtersOpen = true; render(); })}
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:clamp(8px,3vw,26px);padding:2px clamp(10px,2.4vw,20px) 12px">
      <button data-click="${H(() => { shiftPeriod(-1); render(); })}" aria-label="Previous period" style="border:0;background:transparent;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#3b5bdb;flex:none"><svg width="20" height="20"><use href="#ic-left"></use></svg></button>
      <div style="position:relative;border:1px solid #d7dbe3;border-radius:14px;padding:7px 16px;min-width:min(300px,72vw);text-align:center;background:#fff">
        <div style="display:flex;align-items:center;justify-content:center;gap:7px;font-weight:600;letter-spacing:0.02em">
          <svg width="17" height="17" style="color:#3b5bdb"><use href="#ic-calendar"></use></svg>
          ${V.periodTitle}
          <svg width="16" height="16" style="color:#6b7280"><use href="#ic-down"></use></svg>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:1px;font-variant-numeric:tabular-nums">${V.periodRange}</div>
        <select data-change="${H(e => { state.mode = e.target.value; render(); })}" aria-label="Timeframe" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;background:transparent">
          ${['week', 'month', 'quarter', 'year'].map(m => `<option value="${m}" ${V.mode === m ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}
        </select>
      </div>
      <button data-click="${H(() => { shiftPeriod(1); render(); })}" aria-label="Next period" style="border:0;background:transparent;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#3b5bdb;flex:none"><svg width="20" height="20"><use href="#ic-right"></use></svg></button>
    </div>

    ${V.isWide ? `
    <nav style="display:flex;justify-content:center;gap:4px;padding:0 20px;border-top:1px solid #eceef2">
      ${V.navItems.map(n => `
        <button data-click="${H(n.onClick)}" style="border:0;border-bottom:2.5px solid ${n.underline};background:transparent;color:${n.color};font-weight:${n.weight};padding:12px 20px 10px;cursor:pointer;display:flex;align-items:center;gap:9px;font-size:14px">
          <svg width="19" height="19"><use href="${n.icon}"></use></svg>${n.label}
        </button>`).join('')}
    </nav>` : ''}

    <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #eceef2;background:#f7f8fa">
      ${V.summaryCells.map(c => `
        <button data-click="${H(c.onClick)}" style="border:0;border-bottom:3px solid ${c.underline};background:transparent;padding:10px 6px 9px;cursor:${c.cursor};display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0">
          <span style="font-size:13px;font-weight:${c.weight};color:${c.labelColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${c.label}</span>
          <span style="font-size:clamp(15px,2.4vw,18px);font-weight:600;color:${c.color};font-variant-numeric:tabular-nums;white-space:nowrap">${c.value}</span>
        </button>`).join('')}
    </div>
  </header>`;

  const accountsPage = !V.isAccounts ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      ${V.accountGroups.map(g => `
        <section style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#f7f8fa;border-bottom:1px solid #eceef2">
            <span style="font-weight:600;font-size:14px">${g.title}</span>
            <span style="font-weight:600;color:#2f9e44;font-variant-numeric:tabular-nums">${g.total}</span>
          </div>
          ${g.items.map(a => `
            <button data-click="${H(a.onClick)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid #f1f2f5;background:#fff;padding:14px 18px;display:flex;align-items:center;gap:14px;cursor:pointer">
              <span style="width:42px;height:42px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="21" height="21"><use href="${a.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0">
                <span style="display:flex;align-items:baseline;gap:8px">
                  <span style="font-weight:600">${a.name}</span>
                  <span style="font-size:12px;color:#8b93a1">${a.type}</span>
                </span>
                <span style="font-weight:600;color:#2f9e44;font-variant-numeric:tabular-nums">${a.balance}</span>
                ${a.hasGoal ? `
                  <span style="display:flex;align-items:center;gap:9px;margin-top:2px">
                    <span style="flex:1;height:7px;border-radius:4px;background:#e9ebef;overflow:hidden;display:block">
                      <span style="display:block;height:100%;width:${a.goalPct};background:#40c057"></span>
                    </span>
                    <span style="font-size:12px;color:#6b7280;font-variant-numeric:tabular-nums">${a.goalLabel}</span>
                  </span>` : ''}
              </span>
              <span style="font-size:12px;color:#9aa1ad;text-align:right;flex:none">${a.meta}</span>
            </button>`).join('')}
        </section>`).join('')}
      <button data-click="${H(() => openModal('account'))}" style="align-self:flex-start;border:1px solid #d7dbe3;background:#fff;border-radius:12px;padding:11px 18px;cursor:pointer;font-weight:600;color:#3b5bdb;display:flex;align-items:center;gap:8px">
        <svg width="18" height="18"><use href="#ic-plus"></use></svg>Add account
      </button>
    </div>`;

  const categoriesPage = !V.isCategories ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      <section style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-wrap:wrap;align-items:center;gap:22px">
        <div style="position:relative;width:168px;height:168px;flex:none;margin:0 auto;background:${V.donut};border-radius:50%">
          <div style="position:absolute;inset:30%;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px">
            <span style="font-size:11px;color:#8b93a1">${V.donutLabel}</span>
            <span style="font-size:13px;font-weight:700;font-variant-numeric:tabular-nums">${V.donutTotal}</span>
          </div>
        </div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:9px">
          ${V.legend.map(l => `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="width:26px;height:26px;border-radius:50%;background:${l.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="14" height="14"><use href="${l.icon}"></use></svg></span>
              <span style="flex:1;font-size:14px">${l.name}</span>
              <span style="font-size:13px;color:#6b7280;font-variant-numeric:tabular-nums">${l.amount}</span>
              <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;width:52px;text-align:right">${l.pct}</span>
            </div>`).join('')}
        </div>
      </section>
      ${V.catSections.map(sec => `
        <section style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
            <span style="font-weight:700;font-size:15px">${sec.title}</span>
            <span style="font-size:13px;color:#6b7280;font-variant-numeric:tabular-nums">${sec.total}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px">
            ${sec.items.map(c => `
              <button data-click="${H(c.onClick)}" style="background:#fff;border:0;border-radius:14px;padding:14px 10px 16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
                <span style="font-size:14px;font-weight:500;text-align:center;line-height:1.2">${c.name}</span>
                <span style="width:52px;height:52px;border-radius:50%;background:${c.color};color:#fff;display:grid;place-items:center"><svg width="26" height="26"><use href="${c.icon}"></use></svg></span>
                <span style="display:flex;flex-direction:column;align-items:center;gap:1px">
                  <span style="font-weight:700;font-variant-numeric:tabular-nums">${c.total}</span>
                  <span style="font-size:12px;color:${c.budgetColor};font-variant-numeric:tabular-nums">${c.budgetNote}</span>
                </span>
              </button>`).join('')}
            <button data-click="${H(() => openModal('category', null, { kind: state.view === 'income' ? 'income' : 'expense', name: '' }))}" style="background:transparent;border:1.5px dashed #cdd2db;border-radius:14px;padding:14px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#7b8494;min-height:130px">
              <svg width="24" height="24"><use href="#ic-plus"></use></svg>
              <span style="font-size:13px;font-weight:500">New category</span>
            </button>
          </div>
        </section>`).join('')}
    </div>`;

  const balancePage = !V.isBalance ? '' : `
    <div style="display:flex;flex-direction:column;gap:12px;animation:kb-up .25s ease both">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button data-click="${H(() => { state.filtersOpen = !state.filtersOpen; render(); })}" style="border:1px solid ${V.filterBorder};background:#fff;color:${V.filterColor};border-radius:11px;padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:500;font-size:14px">
          <svg width="17" height="17"><use href="#ic-filter"></use></svg>Filters ${V.filterCount}
        </button>
        <span style="flex:1"></span>
        <span style="font-size:13px;color:#6b7280;font-variant-numeric:tabular-nums">${V.movementSummary}</span>
      </div>
      ${V.filtersOpen ? `
        <section style="background:#fff;border-radius:16px;padding:6px 16px 16px;box-shadow:0 1px 2px rgba(16,24,40,0.06);animation:kb-in .2s ease both">
          ${V.filterGroups.map(g => `
            <div style="padding-top:14px">
              <div style="font-size:12px;font-weight:600;color:#8b93a1;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:9px">${g.title}</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${g.items.map(i => `
                  <button data-click="${H(i.onClick)}" style="border:1.4px solid ${i.border};background:${i.bg};color:${i.color};border-radius:10px;padding:7px 12px;cursor:pointer;font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:7px">
                    <svg width="15" height="15"><use href="${i.icon}"></use></svg>${i.label}
                  </button>`).join('')}
              </div>
            </div>`).join('')}
          <button data-click="${H(() => { state.fAccounts = []; state.fTypes = []; state.fCats = []; render(); })}" style="margin-top:16px;border:0;background:transparent;color:#3b5bdb;cursor:pointer;font-weight:600;font-size:13.5px;padding:0">Reset all filters</button>
        </section>` : ''}
      <section style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        ${V.dayGroups.map(d => `
          <div>
            <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:#f7f8fa;border-top:1px solid #eceef2;border-bottom:1px solid #eceef2">
              <span style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;min-width:30px">${d.day}</span>
              <span style="display:flex;flex-direction:column;gap:0;flex:1">
                <span style="font-size:11px;color:#8b93a1;letter-spacing:0.07em">${d.weekday}</span>
                <span style="font-size:11.5px;font-weight:600;color:#5c6473;letter-spacing:0.05em">${d.month}</span>
              </span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${d.netColor}">${d.net}</span>
            </div>
            ${d.items.map(t => `
              <div style="display:flex;align-items:center;gap:13px;padding:12px 16px;border-bottom:1px solid #f4f5f7">
                <span style="width:38px;height:38px;border-radius:50%;background:${t.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="19" height="19"><use href="${t.icon}"></use></svg></span>
                <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span style="font-weight:600;font-size:14.5px">${t.title}</span>
                  <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#7b8494">
                    <svg width="13" height="13"><use href="${t.accountIcon}"></use></svg>${t.account}
                  </span>
                </span>
                <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none">
                  <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${t.amountColor}">${t.amount}</span>
                  <span style="font-size:11.5px;color:#9aa1ad">${t.type}</span>
                </span>
              </div>`).join('')}
          </div>`).join('')}
        ${V.noRows ? `<div style="padding:44px 20px;text-align:center;color:#8b93a1">No movements match these filters.</div>` : ''}
      </section>
    </div>`;

  const overviewPage = !V.isOverview ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      <section style="background:#fff;border-radius:16px;padding:16px 16px 12px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        <div style="display:grid;grid-template-columns:46px 1fr;gap:6px">
          <div style="display:flex;flex-direction:column;justify-content:space-between;height:210px;font-size:11px;color:#9aa1ad;text-align:right;font-variant-numeric:tabular-nums;padding-right:4px">
            ${V.axis.map(a => `<span>${a}</span>`).join('')}
          </div>
          <div style="position:relative;height:210px">
            <span style="position:absolute;left:0;right:0;top:0;height:1px;background:#eceef2"></span>
            <span style="position:absolute;left:0;right:0;top:25%;height:1px;background:#eceef2"></span>
            <span style="position:absolute;left:0;right:0;top:50%;height:1px;background:#eceef2"></span>
            <span style="position:absolute;left:0;right:0;top:75%;height:1px;background:#eceef2"></span>
            <span style="position:absolute;left:0;right:0;bottom:0;height:1px;background:#d7dbe3"></span>
            <div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:${V.barGap}">
              ${V.bars.map(b => `
                <div title="${b.tip}" style="flex:1;height:${b.height};display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px 3px 0 0;overflow:hidden;min-height:1px">
                  ${b.segments.map(s => `<span style="display:block;height:${s.h};background:${s.color}"></span>`).join('')}
                </div>`).join('')}
            </div>
          </div>
          <span></span>
          <div style="display:flex;gap:${V.barGap};padding-top:6px">
            ${V.bars.map(b => `<span style="flex:1;text-align:center;font-size:10.5px;color:#9aa1ad;font-variant-numeric:tabular-nums;overflow:hidden">${b.label}</span>`).join('')}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">
          ${V.averages.map(a => `
            <div style="background:#f4f5f8;border-radius:11px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:2px">
              <span style="font-size:12px;color:#6b7280">${a.label}</span>
              <span style="font-weight:600;color:${a.color};font-variant-numeric:tabular-nums;font-size:14.5px">${a.value}</span>
            </div>`).join('')}
        </div>
      </section>
      <section style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        ${V.ranking.map(r => `
          <div style="border-bottom:1px solid #f1f2f5">
            <button data-click="${H(r.onClick)}" style="width:100%;text-align:left;border:0;background:#fff;padding:12px 16px;display:flex;align-items:center;gap:13px;cursor:pointer">
              <span style="width:40px;height:40px;border-radius:50%;background:${r.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="20" height="20"><use href="${r.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
                <span style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
                  <span style="font-weight:600;font-size:14.5px">${r.name} <span style="color:#9aa1ad;font-weight:400">${r.count}</span></span>
                  <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${r.amountColor}">${r.amount}</span>
                </span>
                <span style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:12px;font-weight:600;color:${r.color};font-variant-numeric:tabular-nums;width:34px">${r.pct}</span>
                  <span style="flex:1;height:7px;border-radius:4px;background:#eceef2;overflow:hidden;display:block">
                    <span style="display:block;height:100%;width:${r.width};background:${r.color}"></span>
                  </span>
                </span>
              </span>
              <span style="width:30px;height:30px;border-radius:50%;border:1px solid #e3e6eb;display:grid;place-items:center;color:#7b8494;flex:none"><svg width="16" height="16"><use href="${r.chevron}"></use></svg></span>
            </button>
            ${r.open ? `
              <div style="background:#f8f9fb;padding:4px 16px 12px 68px;animation:kb-in .18s ease both">
                ${r.detail.map(d => `
                  <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eceef2;font-size:13.5px">
                    <span style="color:#5c6473">${d.left}</span>
                    <span style="font-variant-numeric:tabular-nums;font-weight:500">${d.right}</span>
                  </div>`).join('')}
              </div>` : ''}
          </div>`).join('')}
      </section>
    </div>`;

  const budgetPage = !V.isBudget ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      <section style="background:${V.globalBg};border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:9px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
          <span style="font-weight:700">Expense budget</span>
          <span style="font-weight:700;color:${V.globalColor};font-variant-numeric:tabular-nums">${V.globalRemaining}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="flex:1;height:10px;border-radius:5px;background:${V.globalTrack};overflow:hidden;display:block">
            <span style="display:block;height:100%;width:${V.globalWidth};background:${V.globalColor};transition:width .4s ease"></span>
          </span>
          <span style="font-weight:700;color:${V.globalColor};font-variant-numeric:tabular-nums;font-size:14px">${V.globalPct}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#5c6473;font-variant-numeric:tabular-nums">
          <span>Spent: ${V.globalSpent}</span><span>Limit: ${V.globalLimit}</span>
        </div>
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
          <span style="font-weight:700;font-size:15px">Categories in budget</span>
          <button data-click="${H(() => openModal('budget', null, { category: (unbudgeted()[0] || {}).id || '', limit: '150' }))}" style="border:0;background:transparent;color:#3b5bdb;font-weight:600;cursor:pointer;font-size:13.5px;display:flex;align-items:center;gap:6px;padding:0">
            <svg width="16" height="16"><use href="#ic-plus"></use></svg>Add budget
          </button>
        </div>
        <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          ${V.budgetRows.map(b => `
            <button data-click="${H(b.onClick)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid #f1f2f5;background:#fff;padding:13px 16px;display:flex;align-items:center;gap:13px;cursor:pointer">
              <span style="width:40px;height:40px;border-radius:50%;background:${b.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="20" height="20"><use href="${b.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
                <span style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
                  <span style="font-weight:600;font-size:14.5px">${b.name}</span>
                  <span style="font-weight:600;color:${b.barColor};font-variant-numeric:tabular-nums">${b.left}</span>
                </span>
                <span style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:12px;font-weight:600;color:${b.barColor};font-variant-numeric:tabular-nums;width:38px">${b.pct}</span>
                  <span style="flex:1;height:8px;border-radius:4px;background:#eceef2;overflow:hidden;display:block">
                    <span style="display:block;height:100%;width:${b.width};background:${b.barColor};transition:width .4s ease"></span>
                  </span>
                </span>
                <span style="display:flex;justify-content:space-between;font-size:12.5px;color:#7b8494;font-variant-numeric:tabular-nums">
                  <span>Spent: ${b.spent}</span><span>Limit: ${b.limit}</span>
                </span>
              </span>
            </button>`).join('')}
          ${V.noBudgets ? `<div style="padding:34px 20px;text-align:center;color:#8b93a1">No budgets yet. Pick a category below.</div>` : ''}
        </div>
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <span style="font-weight:700;font-size:15px;padding:0 4px">Without budget</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px">
          ${V.unbudgeted.map(u => `
            <button data-click="${H(u.onClick)}" style="background:#fff;border:0;border-radius:14px;padding:14px 10px 16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
              <span style="font-size:14px;font-weight:500;text-align:center;line-height:1.2">${u.name}</span>
              <span style="width:48px;height:48px;border-radius:50%;background:${u.color};color:#fff;display:grid;place-items:center"><svg width="24" height="24"><use href="${u.icon}"></use></svg></span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums">${u.spent}</span>
            </button>`).join('')}
        </div>
      </section>
    </div>`;

  const main = `<main style="flex:1;width:100%;background:${V.pageTint};transition:background .3s ease">
    <div style="max-width:1080px;margin:0 auto;padding:14px clamp(10px,2.4vw,20px) 110px;display:flex;flex-direction:column;gap:14px">
      ${accountsPage}${categoriesPage}${balancePage}${overviewPage}${budgetPage}
    </div>
  </main>`;

  const bottomNav = !V.isNarrow ? '' : `
    <nav style="position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff;border-top:1px solid #e3e6eb;display:grid;grid-template-columns:repeat(5,1fr);padding:6px 4px 8px">
      ${V.navItems.map(n => `
        <button data-click="${H(n.onClick)}" style="border:0;background:transparent;padding:4px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;color:${n.color}">
          <span style="padding:4px 16px;border-radius:14px;background:${n.pill};display:grid;place-items:center"><svg width="22" height="22"><use href="${n.icon}"></use></svg></span>
          <span style="font-size:11px;font-weight:${n.weight}">${n.label}</span>
        </button>`).join('')}
    </nav>`;

  const drawer = !V.drawerOpen ? '' : `
    <div data-click="${H(() => { state.drawerOpen = false; render(); })}" style="position:fixed;inset:0;z-index:60;background:rgba(20,24,32,0.42);animation:kb-in .18s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="width:min(300px,82vw);height:100%;background:#f7f8fa;display:flex;flex-direction:column;box-shadow:4px 0 24px rgba(16,24,40,0.2)">
        <div style="background:linear-gradient(135deg,#6ea8fe,#e599f7 55%,#ffc9c9);padding:22px 20px 18px;display:flex;flex-direction:column;gap:10px">
          <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;display:grid;place-items:center;overflow:hidden"><img src="cat-logo.png" alt="MerlitoMoney" style="width:74%;height:74%;object-fit:contain"></span>
          <span style="font-weight:700;font-size:19px">MerlitoMoney</span>
        </div>
        ${V.drawerItems.map(d => `
          <button data-click="${H(() => { state.drawerOpen = false; render(); })}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px">
            <svg width="21" height="21" style="color:#3a4150"><use href="${d.icon}"></use></svg>${d.label}
          </button>`).join('')}
        <button data-click="${H(async () => { await api('/api/logout', { method: 'POST' }); state.authed = false; render(); })}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${RED};margin-top:auto">
          <svg width="21" height="21"><use href="#ic-close"></use></svg>Log out
        </button>
      </div>
    </div>`;

  const modal = !V.showModal ? '' : `
    <div data-click="${H(() => { state.modal = null; render(); })}" style="position:fixed;inset:0;z-index:70;background:rgba(20,24,32,0.42);display:flex;align-items:center;justify-content:center;padding:16px;animation:kb-in .16s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="background:#f7f8fa;border-radius:22px;width:100%;max-width:460px;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(16,24,40,0.3);animation:kb-up .2s ease both">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;position:sticky;top:0;background:#f7f8fa;z-index:2">
          <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;background:transparent;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex:none"><svg width="20" height="20"><use href="#ic-close"></use></svg></button>
          <span style="font-size:19px;font-weight:700;flex:1">${V.modalTitle}</span>
          <button data-click="${H(() => submit())}" style="border:0;background:#e7ebfd;color:#3b5bdb;border-radius:12px;padding:9px 16px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:7px">${V.modalCta}</button>
        </div>
        <div style="padding:0 18px 20px;display:flex;flex-direction:column;gap:14px">
          ${V.isMovementModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;gap:6px;border-bottom:1px solid #e3e6eb">
                ${V.movementTabs.map(t => `
                  <button data-click="${H(() => { set('movement', t.value); render(); })}" style="flex:1;border:0;border-bottom:2.5px solid ${t.underline};background:transparent;color:${t.color};font-weight:${t.weight};padding:10px 4px;cursor:pointer">${t.label}</button>`).join('')}
              </div>
              <div style="background:#fff;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px;align-items:center">
                <span style="font-size:12px;color:#8b93a1;letter-spacing:0.06em;text-transform:uppercase">${V.movementKind}</span>
                <input id="f-amount" value="${esc(V.formAmount)}" placeholder="0,00 €" inputmode="decimal" style="border:0;background:transparent;text-align:center;font-size:30px;font-weight:700;width:100%;font-variant-numeric:tabular-nums;outline:none">
                <span style="font-size:12.5px;color:#8b93a1">${V.todayLabel}</span>
              </div>
              ${!V.isTransferMovement ? `
                <div style="display:flex;flex-wrap:wrap;gap:8px">
                  ${V.movementCats.map(c => `
                    <button data-click="${H(() => { set('category', c.id); render(); })}" style="border:0;border-radius:11px;padding:9px 14px;cursor:pointer;background:${c.bg};color:${c.color};font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:8px;opacity:${c.opacity}">
                      <svg width="16" height="16"><use href="${c.icon}"></use></svg>${c.name}
                    </button>`).join('')}
                </div>` : ''}
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Account
                <select data-change="${H(e => { set('account', +e.target.value); render(); })}" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;cursor:pointer;font-size:15px">
                  ${V.accountOptions.map(o => `<option value="${o.v}" ${o.v === V.formAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              ${V.isTransferMovement ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">To account
                  <select data-change="${H(e => { set('toAccount', +e.target.value); render(); })}" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;cursor:pointer;font-size:15px">
                    ${V.toAccountOptions.map(o => `<option value="${o.v}" ${o.v === V.formToAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
            </div>` : ''}

          ${V.isAccountModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="background:#fff;border-radius:14px;padding:6px 14px">
                ${V.accountKinds.map(k => `
                  <button data-click="${H(() => { set('kind', k.value); render(); })}" style="width:100%;border:0;background:transparent;padding:12px 0;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
                    <span style="width:20px;height:20px;border-radius:50%;border:2px solid ${k.ring};display:grid;place-items:center;flex:none">
                      <span style="width:10px;height:10px;border-radius:50%;background:${k.dot}"></span>
                    </span>
                    <span style="flex:1;font-weight:500">${k.label}</span>
                    <svg width="20" height="20" style="color:#7b8494"><use href="${k.icon}"></use></svg>
                  </button>`).join('')}
              </div>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Name
                <input id="f-name" value="${esc(V.formName)}" placeholder="e.g. Everyday account" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;font-size:15px;outline:none">
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Type
                  <select data-change="${H(e => { set('type', e.target.value); render(); })}" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;cursor:pointer;font-size:15px">
                    ${['Bank', 'Cash', 'Wallet', 'Card'].map(t => `<option value="${t}" ${t === V.formType ? 'selected' : ''}>${t === 'Wallet' ? 'Digital wallet' : t}</option>`).join('')}
                  </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Initial balance
                  <input id="f-balance" value="${esc(V.formBalance)}" placeholder="0,00" inputmode="decimal" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>
              </div>
              ${V.isSavingsKind ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Savings goal
                  <input id="f-goal" value="${esc(V.formGoal)}" placeholder="10.000" inputmode="decimal" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>` : ''}
            </div>` : ''}

          ${V.isCatModal ? `
            <div style="display:flex;flex-direction:column;gap:16px">
              <div style="display:flex;align-items:center;gap:14px;background:#fff;border-radius:14px;padding:14px">
                <span style="width:56px;height:56px;border-radius:50%;background:${V.formColor};color:#fff;display:grid;place-items:center;flex:none"><svg width="28" height="28"><use href="${V.formIconRef}"></use></svg></span>
                <input id="f-name" value="${esc(V.formName)}" placeholder="Category name" style="flex:1;border:0;border-bottom:1.5px solid #e3e6eb;padding:8px 2px;font-size:17px;font-weight:600;background:transparent;outline:none">
              </div>
              <div style="display:flex;flex-direction:column;gap:9px">
                <span style="font-size:12px;font-weight:600;color:#8b93a1;text-transform:uppercase;letter-spacing:0.06em">Icon</span>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:8px;background:#fff;border-radius:14px;padding:12px">
                  ${V.iconChoices.map(i => `
                    <button data-click="${H(() => { set('icon', i.value); render(); })}" style="aspect-ratio:1;border:1.5px solid ${i.border};background:${i.bg};border-radius:50%;cursor:pointer;display:grid;place-items:center;color:${i.fg}"><svg width="21" height="21"><use href="${i.ref}"></use></svg></button>`).join('')}
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:9px">
                <span style="font-size:12px;font-weight:600;color:#8b93a1;text-transform:uppercase;letter-spacing:0.06em">Colour</span>
                <div style="display:flex;flex-wrap:wrap;gap:9px;background:#fff;border-radius:14px;padding:12px">
                  ${V.colorChoices.map(c => `
                    <button data-click="${H(() => { set('color', c.value); render(); })}" style="width:32px;height:32px;border-radius:50%;background:${c.value};border:3px solid ${c.ring};cursor:pointer;padding:0"></button>`).join('')}
                </div>
              </div>
              ${V.canDelete ? `
                <button data-click="${H(() => deleteCategoryAction())}" style="border:0;background:#fff;color:#d93a34;border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-trash"></use></svg>Delete category
                </button>` : ''}
            </div>` : ''}

          ${V.isBudgetModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Category
                <select data-change="${H(e => { set('category', +e.target.value); render(); })}" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;cursor:pointer;font-size:15px">
                  ${V.budgetCatOptions.map(o => `<option value="${o.v}" ${o.v === V.formCategory ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#6b7280">Monthly limit
                <input id="f-limit" value="${esc(V.formLimit)}" placeholder="0" inputmode="decimal" style="border:1px solid #dfe3ea;border-radius:12px;padding:12px 13px;background:#fff;font-size:15px;font-variant-numeric:tabular-nums;outline:none">
              </label>
              <div style="font-size:13px;color:#7b8494;background:#fff;border-radius:12px;padding:12px 14px">${V.budgetHint}</div>
              ${V.canRemoveBudget ? `
                <button data-click="${H(() => removeBudgetAction())}" style="border:0;background:#fff;color:#d93a34;border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-trash"></use></svg>Remove budget
                </button>` : ''}
            </div>` : ''}
        </div>
      </div>
    </div>`;

  return `<div style="min-height:100vh;display:flex;flex-direction:column;font-size:15px">${header}${main}${bottomNav}${drawer}${modal}</div>`;
}

// ---------- bootstrap ----------
async function boot() {
  try {
    const me = await api('/api/me');
    if (me.authed) { state.authed = true; await loadAll(); }
  } catch (e) { /* ignore */ }
  render();

  window.matchMedia('(max-width: 859px)').addEventListener('change', e => { state.narrow = e.matches; render(); });

  document.getElementById('root').addEventListener('submit', async e => {
    if (e.target.id === 'login-form') {
      e.preventDefault();
      const pw = document.getElementById('f-password').value;
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
        state.authed = true; state.loginError = '';
        await loadAll();
        render();
      } catch (err) {
        state.loginError = 'Wrong password';
        render();
      }
    }
  });
}

boot();
