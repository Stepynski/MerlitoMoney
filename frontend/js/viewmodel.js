import { state } from './state.js';
import { TH, ACCENT, GREY } from './theme-runtime.js';
import { RED, GREEN, PAL, ICONS, MONTHS, M3, DAYS } from './constants.js';
import { render } from './render.js';
import { reopenAccount } from './actions.js';

// ---------- helpers ported from the design ----------
export function money(v, plus) {
  const s = Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : plus && v > 0 ? '+' : '') + s + ' €';
}
export function short(v) { return Math.round(v).toLocaleString('de-DE') + ' €'; }
export function num(v) { return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0; }
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
export function netWorthHistory(monthsBack) {
  const s = state;
  const sorted = s.tx.slice().sort((a, b) => a._date - b._date);
  const now = new Date();
  let idx = 0, running = s.accounts.reduce((a, acc) => a + acc.starting_balance, 0);
  const points = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const boundary = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    while (idx < sorted.length && sorted[idx]._date <= boundary) {
      const t = sorted[idx];
      running += t.type === 'Income' ? t.amount : t.type === 'Transfer internal' ? 0 : -t.amount;
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
  state.form = Object.assign({ name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: state.accounts[0] ? state.accounts[0].id : '', toAccount: '', icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense', iban: '', note: '' }, form || {});
  render();
}

// ---------- view model (ported from the design's renderVals()) ----------
export function computeView() {
  const s = state, P = period(), T = totals(), M = months();
  const spendable = s.accounts.filter(a => a.grp === 'spend').reduce((x, a) => x + a.balance, 0);
  const total = s.accounts.reduce((x, a) => x + a.balance, 0);
  const saldo = T.inc - T.exp;
  const expView = s.view === 'expenses';

  const nav = [['overview', 'Overview', 'ic-bars'], ['accounts', 'Accounts', 'ic-coins'], ['categories', 'Categories', 'ic-donut'], ['balance', 'Movements', 'ic-receipt'], ['budget', 'Budget', 'ic-gauge']];

  let cells;
  if (s.page === 'accounts') {
    cells = [
      { label: 'Spendable', value: money(spendable), color: TH.text },
      { label: 'Savings', value: money(total - spendable), color: GREEN },
      { label: 'Net worth', value: money(total), color: TH.text }
    ].map(c => Object.assign(c, { labelColor: GREY, weight: '600', underline: 'transparent', cursor: 'default', onClick: () => {} }));
  } else if (s.page === 'balance') {
    const net = T.rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0);
    cells = [
      { label: 'Start balance', value: money(total - net), color: GREY },
      { label: 'Change', value: money(net, true), color: net < 0 ? RED : GREEN },
      { label: 'End balance', value: money(total), color: TH.text }
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
    name: a.name, type: a.type, balance: String(a.starting_balance),
    goal: a.goal_amount ? String(a.goal_amount) : '', kind: a.grp, iban: a.iban || ''
  });
  const accountGroups = [
    { key: 'spend', title: 'Accounts' }, { key: 'save', title: 'Savings accounts' }
  ].map(g => {
    const items = s.accounts.filter(a => a.grp === g.key && a.active);
    return {
      title: g.title, total: money(items.reduce((x, a) => x + a.balance, 0)),
      items: items.map(a => {
        const own = s.tx.filter(t => t.account_id === a.id);
        return {
          name: a.name, type: a.type, icon: '#' + a.icon, color: a.color, balance: money(a.balance),
          hasGoal: !!a.goal_amount, goalPct: a.goal_amount ? Math.min(100, a.balance / a.goal_amount * 100) + '%' : '0%',
          goalLabel: a.goal_amount ? Math.round(a.balance / a.goal_amount * 100) + '% of ' + short(a.goal_amount) : '',
          meta: own.length ? own.length + ' mov.' : 'new',
          onClick: () => { s.page = 'balance'; s.fAccounts = [a.id]; s.filtersOpen = true; render(); },
          onEdit: () => editAccount(a),
          onDelete: () => openModal('deleteAccount', a.id)
        };
      })
    };
  }).filter(g => g.items.length);
  const closedAccounts = s.accounts.filter(a => !a.active).map(a => ({
    name: a.name, icon: '#' + a.icon, color: a.color, balance: money(a.balance),
    onReopen: () => reopenAccount(a.id),
    onDelete: () => openModal('deleteAccount', a.id)
  }));

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
      amountColor: isExp ? RED : isInc ? GREEN : GREY
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
  const axis = [4, 3, 2, 1, 0].map(i => Math.round(peak * i / 4).toLocaleString('de-DE'));
  const bars = buckets.map(b => ({
    label: b.label, height: Math.max(0.5, b.total / peak * 100) + '%', tip: b.full + ' · ' + money(b.total),
    segments: Object.keys(b.byCat).sort((x, y) => b.byCat[y] - b.byCat[x]).map(id => {
      const c = cat(+id);
      return { h: (b.byCat[id] / b.total * 100) + '%', color: c ? c.color : TH.textFaint };
    })
  }));
  const spanDays = Math.max(1, Math.round((Math.min(P.end, new Date()) - P.start) / 86400000) + 1);

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
    movement: ['New movement', 'Save'], account: [s.editId ? 'Edit account' : 'New account', 'Save'],
    category: [s.editId ? 'Edit category' : 'New category', 'Apply'],
    budget: [s.editId ? 'Edit budget' : 'Set budget', 'Save'],
    deleteAccount: ['Delete account', ''],
    settings: ['Settings', '']
  }[s.modal] || ['', ''];
  const deleteAccountTarget = s.modal === 'deleteAccount' ? acct(s.editId) : null;

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
    isOverview: s.page === 'overview', isBudget: s.page === 'budget',
    accountGroups, closedAccounts,
    donut, donutLabel: s.view === 'income' ? 'Income' : 'Expenses', donutTotal: short(donutBase),
    legend, catSections,
    filtersOpen: s.filtersOpen,
    filterGroups, filterCount: fCount ? '(' + fCount + ')' : '',
    filterBorder: fCount ? ACCENT : TH.border, filterColor: fCount ? ACCENT : GREY,
    dayGroups, noRows: rows.length === 0,
    movementSummary: rows.length + ' movements · net ' + money(rows.reduce((a, t) => a + (t.type === 'Expense' ? -t.amount : t.type === 'Income' ? t.amount : 0), 0), true),
    axis, bars, barGap: bars.length > 20 ? '2px' : bars.length > 10 ? '5px' : '12px',
    netWorthTrend, dashboardAccounts, budgetWatch, topExpenseCats, topIncomeCats, insight, recentTx,
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
    drawerItems: [{ label: 'Data', icon: '#ic-db' }, { label: 'Backups', icon: '#ic-refresh' }, { label: 'About', icon: '#ic-info' }],
    showModal: !!s.modal, isMovementModal: s.modal === 'movement', isAccountModal: s.modal === 'account',
    isCatModal: s.modal === 'category', isBudgetModal: s.modal === 'budget', isSettingsModal: s.modal === 'settings',
    isDeleteAccountModal: s.modal === 'deleteAccount',
    deleteAccountName: deleteAccountTarget ? deleteAccountTarget.name : '',
    deleteAccountMovCount: deleteAccountTarget ? s.tx.filter(t => t.account_id === deleteAccountTarget.id || t.to_account_id === deleteAccountTarget.id).length : 0,
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
    accountKinds: [['spend', 'Account', 'ic-wallet'], ['save', 'Savings account', 'ic-piggy']].map(k => ({
      value: k[0], label: k[1], icon: '#' + k[2],
      ring: s.form.kind === k[0] ? ACCENT : TH.border, dot: s.form.kind === k[0] ? ACCENT : 'transparent'
    })),
    isSavingsKind: s.form.kind === 'save',
    showIban: s.form.kind === 'save' || s.form.type === 'Bank',
    formIban: s.form.iban, formError: s.formError,
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
