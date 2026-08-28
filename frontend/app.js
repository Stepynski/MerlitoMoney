'use strict';

// ---------- constants ----------
const RED = '#d93a34', GREEN = '#2f9e44';
let TH = null, ACCENT = null, GREY = null;
const PAL = ['#1f6fd0', '#e03b34', '#4caf50', '#f4703a', '#12897f', '#f2a25c', '#7048c8', '#b6d334', '#5b46b8', '#26aee8', '#ef5b8c', '#e8a33d', '#a531b5', '#c0173f', '#8b6ce0'];

// ---------- themes: 4 styles x light/dark ----------
const THEME_STYLES = [
  { key: 'colorful', label: 'Colorful' },
  { key: 'professional', label: 'Professional' },
  { key: 'kakeibo', label: 'Kakeibo' },
  { key: 'mono', label: 'Mono' }
];
const THEMES = {
  colorful: {
    light: {
      pageBg: '#eef0f3', surface: '#fff', surface2: '#f7f8fa', border: '#e3e7ee',
      text: '#1b1f26', textSoft: '#6b7280', textFaint: '#9aa1ad',
      accent: '#3b5bdb', accentSoft: '#e7ebfd',
      hero: 'linear-gradient(135deg,#6ea8fe,#e599f7 55%,#ffc9c9)',
      tint: {
        accounts: 'linear-gradient(180deg,#e9f1ff 0%,#eef0f3 260px)',
        categories: 'linear-gradient(180deg,#f4ecff 0%,#eef0f3 260px)',
        balance: 'linear-gradient(180deg,#e8faf0 0%,#eef0f3 260px)',
        overview: 'linear-gradient(180deg,#fff3e6 0%,#eef0f3 260px)',
        budget: 'linear-gradient(180deg,#e6faf7 0%,#eef0f3 260px)'
      }
    },
    dark: {
      pageBg: '#14161b', surface: '#1e2128', surface2: '#262a33', border: '#333844',
      text: '#eef0f3', textSoft: '#9aa3b2', textFaint: '#6b7280',
      accent: '#6f93ff', accentSoft: '#28304a',
      hero: 'linear-gradient(135deg,#3d5aa8,#7a4a96 55%,#a85f6a)',
      tint: {
        accounts: 'linear-gradient(180deg,#1b2740 0%,#14161b 260px)',
        categories: 'linear-gradient(180deg,#2a2140 0%,#14161b 260px)',
        balance: 'linear-gradient(180deg,#183024 0%,#14161b 260px)',
        overview: 'linear-gradient(180deg,#332714 0%,#14161b 260px)',
        budget: 'linear-gradient(180deg,#153230 0%,#14161b 260px)'
      }
    }
  },
  professional: {
    light: {
      pageBg: '#f2f4f7', surface: '#fff', surface2: '#eaeef4', border: '#dde2ea',
      text: '#0f1a2e', textSoft: '#5b6472', textFaint: '#8a92a0',
      accent: '#1c3f7c', accentSoft: '#e2e8f5',
      hero: 'linear-gradient(120deg,#0f1a2e,#1c3f7c)',
      tint: { accounts: '#f2f4f7', categories: '#f2f4f7', balance: '#f2f4f7', overview: '#f2f4f7', budget: '#f2f4f7' }
    },
    dark: {
      pageBg: '#0b0f17', surface: '#131824', surface2: '#1a2030', border: '#262e40',
      text: '#eef1f5', textSoft: '#8a92a0', textFaint: '#5b6472',
      accent: '#5b8def', accentSoft: '#1e2c4d',
      hero: 'linear-gradient(120deg,#060810,#111b30)',
      tint: { accounts: '#0b0f17', categories: '#0b0f17', balance: '#0b0f17', overview: '#0b0f17', budget: '#0b0f17' }
    }
  },
  kakeibo: {
    light: {
      pageBg: '#f7f1e6', surface: '#fffaf2', surface2: '#f0e6d2', border: '#e6d8bd',
      text: '#2e2418', textSoft: '#7a6a52', textFaint: '#a3927a',
      accent: '#b5651d', accentSoft: '#f3e0cc',
      hero: 'linear-gradient(135deg,#e8b96a,#d98d6b 55%,#c96a5c)',
      tint: {
        accounts: 'linear-gradient(180deg,#f2e6cf 0%,#f7f1e6 260px)',
        categories: 'linear-gradient(180deg,#f0e2d8 0%,#f7f1e6 260px)',
        balance: 'linear-gradient(180deg,#eee6cd 0%,#f7f1e6 260px)',
        overview: 'linear-gradient(180deg,#f3e0c8 0%,#f7f1e6 260px)',
        budget: 'linear-gradient(180deg,#efe4cf 0%,#f7f1e6 260px)'
      }
    },
    dark: {
      pageBg: '#1c1610', surface: '#2a2219', surface2: '#352b1f', border: '#4a3d2c',
      text: '#f3e9d8', textSoft: '#b3a084', textFaint: '#7a6a52',
      accent: '#e0975a', accentSoft: '#4a3620',
      hero: 'linear-gradient(135deg,#6b4a26,#8a4a3a 55%,#6b3530)',
      tint: {
        accounts: 'linear-gradient(180deg,#2c2314 0%,#1c1610 260px)',
        categories: 'linear-gradient(180deg,#2c2018 0%,#1c1610 260px)',
        balance: 'linear-gradient(180deg,#2a2414 0%,#1c1610 260px)',
        overview: 'linear-gradient(180deg,#2e2416 0%,#1c1610 260px)',
        budget: 'linear-gradient(180deg,#2b2416 0%,#1c1610 260px)'
      }
    }
  },
  mono: {
    light: {
      pageBg: '#fafafa', surface: '#fff', surface2: '#f0f0f0', border: '#e0e0e0',
      text: '#111111', textSoft: '#666666', textFaint: '#999999',
      accent: '#0a7d5c', accentSoft: '#dff2ea',
      hero: '#111111',
      tint: { accounts: '#fafafa', categories: '#fafafa', balance: '#fafafa', overview: '#fafafa', budget: '#fafafa' }
    },
    dark: {
      pageBg: '#0a0a0a', surface: '#161616', surface2: '#202020', border: '#2e2e2e',
      text: '#f2f2f2', textSoft: '#a0a0a0', textFaint: '#6e6e6e',
      accent: '#2fd996', accentSoft: '#16332a',
      hero: '#000000',
      tint: { accounts: '#0a0a0a', categories: '#0a0a0a', balance: '#0a0a0a', overview: '#0a0a0a', budget: '#0a0a0a' }
    }
  }
};
function currentTheme() {
  const style = THEMES[state.themeStyle] ? state.themeStyle : 'colorful';
  const mode = THEMES[style][state.themeMode] ? state.themeMode : 'light';
  return THEMES[style][mode];
}
const ICONS = ['ic-cart', 'ic-fork', 'ic-car', 'ic-bag', 'ic-health', 'ic-home', 'ic-play', 'ic-dots', 'ic-salary', 'ic-refresh', 'ic-gift', 'ic-star', 'ic-bank', 'ic-wallet', 'ic-cash', 'ic-piggy', 'ic-transfer', 'ic-receipt'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ---------- state ----------
function loadThemePref(key, fallback) {
  try { const v = localStorage.getItem(key); return v || fallback; } catch (e) { return fallback; }
}
function saveThemePref(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

const state = {
  authed: false, loginError: '',
  accounts: [], cats: [], tx: [], budgets: {},
  page: 'overview', mode: 'month', anchor: new Date(), view: 'expenses',
  fAccounts: [], fTypes: [], fCats: [], filtersOpen: false,
  narrow: window.matchMedia('(max-width: 859px)').matches,
  drawerOpen: false, modal: null, editId: null,
  themeStyle: loadThemePref('mm_theme_style', 'colorful'),
  themeMode: loadThemePref('mm_theme_mode', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
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

function periodFor(a) {
  if (state.mode === 'week') {
    const start = new Date(a); start.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end, title: 'WEEK ' + dm(start) };
  }
  if (state.mode === 'month') return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 0), title: MONTHS[a.getMonth()].toUpperCase() + ' ' + a.getFullYear() };
  if (state.mode === 'quarter') { const q = Math.floor(a.getMonth() / 3) * 3; return { start: new Date(a.getFullYear(), q, 1), end: new Date(a.getFullYear(), q + 3, 0), title: 'Q' + (q / 3 + 1) + ' ' + a.getFullYear() }; }
  return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31), title: 'YEAR ' + a.getFullYear() };
}
function period() { return periodFor(state.anchor); }
function shiftedAnchor(dir) {
  const a = new Date(state.anchor);
  if (state.mode === 'week') a.setDate(a.getDate() + 7 * dir);
  else if (state.mode === 'month') a.setMonth(a.getMonth() + dir);
  else if (state.mode === 'quarter') a.setMonth(a.getMonth() + 3 * dir);
  else a.setFullYear(a.getFullYear() + dir);
  return a;
}
function shiftPeriod(dir) { state.anchor = shiftedAnchor(dir); }
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
function netWorthHistory(monthsBack) {
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
async function logoutAction() {
  await api('/api/logout', { method: 'POST' });
  state.authed = false;
  state.modal = null; state.drawerOpen = false;
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

function themeSettingsHtml() {
  return `
    <div style="background:${TH.surface};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px">
      <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em">Theme</span>
      <div style="display:flex;gap:8px">
        ${['light', 'dark'].map(m => {
          const on = state.themeMode === m;
          return `<button data-click="${H(() => { state.themeMode = m; saveThemePref('mm_theme_mode', m); render(); })}" style="flex:1;border:1.5px solid ${on ? ACCENT : TH.border};background:${on ? TH.accentSoft : 'transparent'};color:${on ? ACCENT : TH.text};border-radius:10px;padding:9px;cursor:pointer;font-weight:600;font-size:13.5px;text-transform:capitalize">${m}</button>`;
        }).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
        ${THEME_STYLES.map(s => {
          const on = state.themeStyle === s.key;
          const preview = THEMES[s.key][state.themeMode];
          return `<button data-click="${H(() => { state.themeStyle = s.key; saveThemePref('mm_theme_style', s.key); render(); })}" style="border:1.5px solid ${on ? ACCENT : TH.border};background:${on ? TH.accentSoft : 'transparent'};border-radius:12px;padding:10px;cursor:pointer;display:flex;align-items:center;gap:9px;text-align:left">
            <span style="width:22px;height:22px;border-radius:50%;flex:none;background:${preview.hero};border:1px solid ${TH.border}"></span>
            <span style="font-size:13.5px;font-weight:${on ? '700' : '500'};color:${on ? ACCENT : TH.text}">${s.label}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

// ---------- view model (ported from the design's renderVals()) ----------
function computeView() {
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
      account: a ? a.name : '—', date: dm(t._date).slice(0, 5),
      amount: money(isExp ? -t.amount : t.amount, isInc), amountColor: isExp ? RED : isInc ? GREEN : GREY
    };
  });

  const modalMeta = {
    movement: ['New movement', 'Save'], account: ['New account', 'Save'],
    category: [s.editId ? 'Edit category' : 'New category', 'Apply'],
    budget: [s.editId ? 'Edit budget' : 'Set budget', 'Save'],
    settings: ['Settings', '']
  }[s.modal] || ['', ''];

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
    accountGroups,
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
      ring: s.form.kind === k[0] ? ACCENT : TH.border, dot: s.form.kind === k[0] ? ACCENT : 'transparent'
    })),
    isSavingsKind: s.form.kind === 'save',
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

// ---------- rendering ----------
function render() {
  TH = currentTheme();
  ACCENT = TH.accent;
  GREY = TH.textSoft;
  document.body.style.background = TH.pageBg;
  document.body.style.color = TH.text;
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
    <form id="login-form" style="background:${TH.surface};border-radius:20px;padding:28px 26px;width:100%;max-width:340px;box-shadow:0 8px 30px rgba(16,24,40,0.12);display:flex;flex-direction:column;gap:14px">
      <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;color:#1b1f26;display:grid;place-items:center;font-weight:700;font-size:24px;margin:0 auto">K</span>
      <span style="font-weight:700;font-size:20px;text-align:center">MerlitoMoney</span>
      <input id="f-password" type="password" placeholder="Password" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;font-size:15px;outline:none" autofocus>
      ${state.loginError ? `<span style="color:${RED};font-size:13px">${esc(state.loginError)}</span>` : ''}
      <button type="submit" style="border:0;background:${ACCENT};color:#fff;border-radius:12px;padding:12px;cursor:pointer;font-weight:600;font-size:15px">Log in</button>
    </form>
  </div>`;
}

function iconBtn(V, ariaLabel, iconId, size, onClick, extraStyle) {
  return `<button data-click="${H(onClick)}" aria-label="${ariaLabel}" style="border:0;background:transparent;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none${extraStyle || ''}"><svg width="${size}" height="${size}"><use href="#${iconId}"></use></svg></button>`;
}

function renderApp() {
  const V = computeView();

  const header = `
  <header style="position:sticky;top:0;z-index:30;background:${TH.hero};box-shadow:0 1px 0 rgba(0,0,0,0.07)">
    <div style="display:flex;align-items:center;gap:8px;padding:10px clamp(10px,2.4vw,20px)">
      ${V.isNarrow ? iconBtn(V, 'Menu', 'ic-menu', 22, () => { state.drawerOpen = !state.drawerOpen; render(); }) : '<span style="width:40px;flex:none"></span>'}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0">
        <span style="font-size:12px;color:${GREY}">Accounts balance</span>
        <span style="font-size:clamp(20px,3.4vw,26px);font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">${V.spendableBalance}</span>
        <span style="font-size:12px;color:#2f9e44;font-variant-numeric:tabular-nums">Total ${V.totalBalance}</span>
      </div>
      ${iconBtn(V, 'New movement', 'ic-plus', 22, () => openModal('movement', null, { movement: 'Expense', category: (state.cats.find(c => c.kind === 'expense') || {}).id || '', account: state.accounts[0] ? state.accounts[0].id : '' }))}
      ${iconBtn(V, 'Search', 'ic-search', 20, () => { state.page = 'balance'; state.filtersOpen = true; render(); })}
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:clamp(8px,3vw,26px);padding:2px clamp(10px,2.4vw,20px) 12px">
      <button data-click="${H(() => { shiftPeriod(-1); render(); })}" aria-label="Previous period" style="border:0;background:transparent;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${ACCENT};flex:none"><svg width="20" height="20"><use href="#ic-left"></use></svg></button>
      <div style="position:relative;border:1px solid ${TH.border};border-radius:14px;padding:7px 16px;min-width:min(300px,72vw);text-align:center;background:${TH.surface}">
        <div style="display:flex;align-items:center;justify-content:center;gap:7px;font-weight:600;letter-spacing:0.02em">
          <svg width="17" height="17" style="color:${ACCENT}"><use href="#ic-calendar"></use></svg>
          ${V.periodTitle}
          <svg width="16" height="16" style="color:${GREY}"><use href="#ic-down"></use></svg>
        </div>
        <div style="font-size:12px;color:${GREY};margin-top:1px;font-variant-numeric:tabular-nums">${V.periodRange}</div>
        <select data-change="${H(e => { state.mode = e.target.value; render(); })}" aria-label="Timeframe" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;background:transparent">
          ${['week', 'month', 'quarter', 'year'].map(m => `<option value="${m}" ${V.mode === m ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}
        </select>
      </div>
      <button data-click="${H(() => { shiftPeriod(1); render(); })}" aria-label="Next period" style="border:0;background:transparent;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${ACCENT};flex:none"><svg width="20" height="20"><use href="#ic-right"></use></svg></button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid ${TH.border};background:${TH.surface2}">
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
        <section style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:${TH.surface2};border-bottom:1px solid ${TH.border}">
            <span style="font-weight:600;font-size:14px">${g.title}</span>
            <span style="font-weight:600;color:#2f9e44;font-variant-numeric:tabular-nums">${g.total}</span>
          </div>
          ${g.items.map(a => `
            <button data-click="${H(a.onClick)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid ${TH.border};background:${TH.surface};padding:14px 18px;display:flex;align-items:center;gap:14px;cursor:pointer">
              <span style="width:42px;height:42px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="21" height="21"><use href="${a.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0">
                <span style="display:flex;align-items:baseline;gap:8px">
                  <span style="font-weight:600">${a.name}</span>
                  <span style="font-size:12px;color:${GREY}">${a.type}</span>
                </span>
                <span style="font-weight:600;color:#2f9e44;font-variant-numeric:tabular-nums">${a.balance}</span>
                ${a.hasGoal ? `
                  <span style="display:flex;align-items:center;gap:9px;margin-top:2px">
                    <span style="flex:1;height:7px;border-radius:4px;background:#e9ebef;overflow:hidden;display:block">
                      <span style="display:block;height:100%;width:${a.goalPct};background:#40c057"></span>
                    </span>
                    <span style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${a.goalLabel}</span>
                  </span>` : ''}
              </span>
              <span style="font-size:12px;color:${TH.textFaint};text-align:right;flex:none">${a.meta}</span>
            </button>`).join('')}
        </section>`).join('')}
      <button data-click="${H(() => openModal('account'))}" style="align-self:flex-start;border:1px solid ${TH.border};background:${TH.surface};border-radius:12px;padding:11px 18px;cursor:pointer;font-weight:600;color:${ACCENT};display:flex;align-items:center;gap:8px">
        <svg width="18" height="18"><use href="#ic-plus"></use></svg>Add account
      </button>
    </div>`;

  const categoriesPage = !V.isCategories ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      <section style="background:${TH.surface};border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-wrap:wrap;align-items:center;gap:22px">
        <div style="position:relative;width:168px;height:168px;flex:none;margin:0 auto;background:${V.donut};border-radius:50%">
          <div style="position:absolute;inset:30%;background:${TH.surface};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px">
            <span style="font-size:11px;color:${GREY}">${V.donutLabel}</span>
            <span style="font-size:13px;font-weight:700;font-variant-numeric:tabular-nums">${V.donutTotal}</span>
          </div>
        </div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:9px">
          ${V.legend.map(l => `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="width:26px;height:26px;border-radius:50%;background:${l.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="14" height="14"><use href="${l.icon}"></use></svg></span>
              <span style="flex:1;font-size:14px">${l.name}</span>
              <span style="font-size:13px;color:${GREY};font-variant-numeric:tabular-nums">${l.amount}</span>
              <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;width:52px;text-align:right">${l.pct}</span>
            </div>`).join('')}
        </div>
      </section>
      ${V.catSections.map(sec => `
        <section style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
            <span style="font-weight:700;font-size:15px">${sec.title}</span>
            <span style="font-size:13px;color:${GREY};font-variant-numeric:tabular-nums">${sec.total}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px">
            ${sec.items.map(c => `
              <button data-click="${H(c.onClick)}" style="background:${TH.surface};border:0;border-radius:14px;padding:14px 10px 16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
                <span style="font-size:14px;font-weight:500;text-align:center;line-height:1.2">${c.name}</span>
                <span style="width:52px;height:52px;border-radius:50%;background:${c.color};color:#fff;display:grid;place-items:center"><svg width="26" height="26"><use href="${c.icon}"></use></svg></span>
                <span style="display:flex;flex-direction:column;align-items:center;gap:1px">
                  <span style="font-weight:700;font-variant-numeric:tabular-nums">${c.total}</span>
                  <span style="font-size:12px;color:${c.budgetColor};font-variant-numeric:tabular-nums">${c.budgetNote}</span>
                </span>
              </button>`).join('')}
            <button data-click="${H(() => openModal('category', null, { kind: state.view === 'income' ? 'income' : 'expense', name: '' }))}" style="background:transparent;border:1.5px dashed ${TH.border};border-radius:14px;padding:14px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:${GREY};min-height:130px">
              <svg width="24" height="24"><use href="#ic-plus"></use></svg>
              <span style="font-size:13px;font-weight:500">New category</span>
            </button>
          </div>
        </section>`).join('')}
    </div>`;

  const balancePage = !V.isBalance ? '' : `
    <div style="display:flex;flex-direction:column;gap:12px;animation:kb-up .25s ease both">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button data-click="${H(() => { state.filtersOpen = !state.filtersOpen; render(); })}" style="border:1px solid ${V.filterBorder};background:${TH.surface};color:${V.filterColor};border-radius:11px;padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:500;font-size:14px">
          <svg width="17" height="17"><use href="#ic-filter"></use></svg>Filters ${V.filterCount}
        </button>
        <span style="flex:1"></span>
        <span style="font-size:13px;color:${GREY};font-variant-numeric:tabular-nums">${V.movementSummary}</span>
      </div>
      ${V.filtersOpen ? `
        <section style="background:${TH.surface};border-radius:16px;padding:6px 16px 16px;box-shadow:0 1px 2px rgba(16,24,40,0.06);animation:kb-in .2s ease both">
          ${V.filterGroups.map(g => `
            <div style="padding-top:14px">
              <div style="font-size:12px;font-weight:600;color:${GREY};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:9px">${g.title}</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${g.items.map(i => `
                  <button data-click="${H(i.onClick)}" style="border:1.4px solid ${i.border};background:${i.bg};color:${i.color};border-radius:10px;padding:7px 12px;cursor:pointer;font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:7px">
                    <svg width="15" height="15"><use href="${i.icon}"></use></svg>${i.label}
                  </button>`).join('')}
              </div>
            </div>`).join('')}
          <button data-click="${H(() => { state.fAccounts = []; state.fTypes = []; state.fCats = []; render(); })}" style="margin-top:16px;border:0;background:transparent;color:${ACCENT};cursor:pointer;font-weight:600;font-size:13.5px;padding:0">Reset all filters</button>
        </section>` : ''}
      <section style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        ${V.dayGroups.map(d => `
          <div>
            <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:${TH.surface2};border-top:1px solid ${TH.border};border-bottom:1px solid ${TH.border}">
              <span style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;min-width:30px">${d.day}</span>
              <span style="display:flex;flex-direction:column;gap:0;flex:1">
                <span style="font-size:11px;color:${GREY};letter-spacing:0.07em">${d.weekday}</span>
                <span style="font-size:11.5px;font-weight:600;color:${GREY};letter-spacing:0.05em">${d.month}</span>
              </span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${d.netColor}">${d.net}</span>
            </div>
            ${d.items.map(t => `
              <div style="display:flex;align-items:center;gap:13px;padding:12px 16px;border-bottom:1px solid ${TH.border}">
                <span style="width:38px;height:38px;border-radius:50%;background:${t.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="19" height="19"><use href="${t.icon}"></use></svg></span>
                <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span style="font-weight:600;font-size:14.5px">${t.title}</span>
                  <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${GREY}">
                    <svg width="13" height="13"><use href="${t.accountIcon}"></use></svg>${t.account}
                  </span>
                </span>
                <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none">
                  <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${t.amountColor}">${t.amount}</span>
                  <span style="font-size:11.5px;color:${TH.textFaint}">${t.type}</span>
                </span>
              </div>`).join('')}
          </div>`).join('')}
        ${V.noRows ? `<div style="padding:44px 20px;text-align:center;color:${GREY}">No movements match these filters.</div>` : ''}
      </section>
    </div>`;

  const catMiniList = items => items.map(c => `
    <div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid ${TH.border}">
      <span style="width:34px;height:34px;border-radius:50%;background:${c.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="16" height="16"><use href="${c.icon}"></use></svg></span>
      <span style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
        <span style="display:flex;justify-content:space-between;gap:10px;font-size:13.5px;font-weight:600"><span>${c.name}</span><span style="font-variant-numeric:tabular-nums">${c.amount}</span></span>
        <span style="display:flex;align-items:center;gap:8px">
          <span style="height:6px;flex:1;border-radius:3px;background:${TH.border};overflow:hidden;display:block"><span style="display:block;height:100%;width:${c.width};background:${c.color}"></span></span>
          <span style="font-size:11.5px;color:${TH.textFaint};width:32px;text-align:right">${c.pct}</span>
        </span>
      </span>
    </div>`).join('');

  const overviewPage = !V.isOverview ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      <div class="mm-dash-hero">
        <section style="background:${TH.surface};border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-weight:700;font-size:15px">Net worth</span>
            <span style="font-weight:600;color:${V.netWorthTrend.changeColor};font-size:13px">${V.netWorthTrend.changeLabel}</span>
          </div>
          <span style="font-size:25px;font-weight:700;font-variant-numeric:tabular-nums">${V.netWorthTrend.current}</span>
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:70px;display:block">
            <path d="${V.netWorthTrend.area}" fill="${ACCENT}22" stroke="none"></path>
            <path d="${V.netWorthTrend.path}" fill="none" stroke="${ACCENT}" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>
          </svg>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:${TH.textFaint}">
            ${V.netWorthTrend.labels.map(l => `<span>${l}</span>`).join('')}
          </div>
        </section>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="flex:1;background:${TH.surface};border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:3px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            <span style="font-size:11.5px;color:${GREY}">Daily avg spend</span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums;font-size:16px;color:${RED}">${V.insight.avgDaily}</span>
          </div>
          <div style="flex:1;background:${TH.surface};border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:3px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            <span style="font-size:11.5px;color:${GREY}">No-spend days</span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums;font-size:16px">${V.insight.noSpendDays}</span>
          </div>
          <div style="flex:1;background:${TH.surface};border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:3px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            <span style="font-size:11.5px;color:${GREY}">Trend</span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums;font-size:16px;color:${V.insight.trendColor}">${V.insight.trendLabel}</span>
          </div>
        </div>
      </div>

      <section style="background:${TH.surface};border-radius:16px;padding:16px 16px 12px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        <div style="display:grid;grid-template-columns:46px 1fr;gap:6px">
          <div style="display:flex;flex-direction:column;justify-content:space-between;height:210px;font-size:11px;color:${TH.textFaint};text-align:right;font-variant-numeric:tabular-nums;padding-right:4px">
            ${V.axis.map(a => `<span>${a}</span>`).join('')}
          </div>
          <div style="position:relative;height:210px">
            <span style="position:absolute;left:0;right:0;top:0;height:1px;background:${TH.border}"></span>
            <span style="position:absolute;left:0;right:0;top:25%;height:1px;background:${TH.border}"></span>
            <span style="position:absolute;left:0;right:0;top:50%;height:1px;background:${TH.border}"></span>
            <span style="position:absolute;left:0;right:0;top:75%;height:1px;background:${TH.border}"></span>
            <span style="position:absolute;left:0;right:0;bottom:0;height:1px;background:${TH.border}"></span>
            <div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:${V.barGap}">
              ${V.bars.map(b => `
                <div title="${b.tip}" style="flex:1;height:${b.height};display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px 3px 0 0;overflow:hidden;min-height:1px">
                  ${b.segments.map(s => `<span style="display:block;height:${s.h};background:${s.color}"></span>`).join('')}
                </div>`).join('')}
            </div>
          </div>
          <span></span>
          <div style="display:flex;gap:${V.barGap};padding-top:6px">
            ${V.bars.map(b => `<span style="flex:1;text-align:center;font-size:10.5px;color:${TH.textFaint};font-variant-numeric:tabular-nums;overflow:hidden">${b.label}</span>`).join('')}
          </div>
        </div>
      </section>

      <div class="mm-dash-split">
        <section style="display:flex;flex-direction:column;gap:8px">
          <span style="font-weight:700;font-size:15px;padding:0 4px">Top expense categories</span>
          <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            ${V.topExpenseCats.length ? catMiniList(V.topExpenseCats) : `<div style="padding:24px 16px;text-align:center;color:${GREY};font-size:13.5px">No expenses yet.</div>`}
          </div>
        </section>
        <section style="display:flex;flex-direction:column;gap:8px">
          <span style="font-weight:700;font-size:15px;padding:0 4px">Top income categories</span>
          <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            ${V.topIncomeCats.length ? catMiniList(V.topIncomeCats) : `<div style="padding:24px 16px;text-align:center;color:${GREY};font-size:13.5px">No income yet.</div>`}
          </div>
        </section>
      </div>

      ${V.dashboardAccounts.length ? `
      <section style="display:flex;flex-direction:column;gap:8px">
        <span style="font-weight:700;font-size:15px;padding:0 4px">Accounts</span>
        <div style="display:flex;gap:10px;overflow-x:auto;padding:2px 4px 6px">
          ${V.dashboardAccounts.map(a => `
            <button data-click="${H(a.onClick)}" style="flex:none;min-width:128px;background:${TH.surface};border:0;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,0.06);text-align:left">
              <span style="width:32px;height:32px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center"><svg width="16" height="16"><use href="${a.icon}"></use></svg></span>
              <span style="font-size:12.5px;color:${GREY};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;font-size:14px">${a.balance}</span>
            </button>`).join('')}
        </div>
      </section>` : ''}

      ${V.budgetWatch.length ? `
      <section style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 4px">
          <span style="font-weight:700;font-size:15px">Budget status</span>
          <button data-click="${H(() => { state.page = 'budget'; render(); })}" style="border:0;background:transparent;color:${ACCENT};font-weight:600;cursor:pointer;font-size:13px;padding:0">See all</button>
        </div>
        <div style="background:${V.globalBg};border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <span style="flex:1;height:9px;border-radius:5px;background:${V.globalTrack};overflow:hidden;display:block">
              <span style="display:block;height:100%;width:${V.globalWidth};background:${V.globalColor}"></span>
            </span>
            <span style="font-weight:700;color:${V.globalColor};font-variant-numeric:tabular-nums;font-size:13.5px">${V.globalPct}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:${GREY};font-variant-numeric:tabular-nums">
            <span>Spent: ${V.globalSpent}</span><span>Limit: ${V.globalLimit}</span>
          </div>
        </div>
        <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          ${V.budgetWatch.map(b => `
            <button data-click="${H(b.onClick)}" style="width:100%;text-align:left;border:0;background:${TH.surface};padding:12px 16px;border-bottom:1px solid ${TH.border};display:flex;align-items:center;gap:12px;cursor:pointer">
              <span style="width:34px;height:34px;border-radius:50%;background:${b.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="16" height="16"><use href="${b.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
                <span style="display:flex;justify-content:space-between;font-size:13.5px;font-weight:600"><span>${b.name}</span><span style="color:${b.barColor}">${b.pct}</span></span>
                <span style="height:6px;border-radius:3px;background:${TH.border};overflow:hidden;display:block"><span style="display:block;height:100%;width:${b.width};background:${b.barColor}"></span></span>
              </span>
            </button>`).join('')}
        </div>
      </section>` : ''}

      <section style="display:flex;flex-direction:column;gap:8px">
        <span style="font-weight:700;font-size:15px;padding:0 4px">Recent transactions</span>
        <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          ${V.recentTx.length ? V.recentTx.map(t => `
            <div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid ${TH.border}">
              <span style="width:34px;height:34px;border-radius:50%;background:${t.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="16" height="16"><use href="${t.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                <span style="font-weight:600;font-size:13.5px">${t.title}</span>
                <span style="font-size:12px;color:${GREY}">${t.account} · ${t.date}</span>
              </span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${t.amountColor};flex:none">${t.amount}</span>
            </div>`).join('') : `<div style="padding:24px 16px;text-align:center;color:${GREY};font-size:13.5px">No movements yet.</div>`}
        </div>
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
        <div style="display:flex;justify-content:space-between;font-size:13px;color:${GREY};font-variant-numeric:tabular-nums">
          <span>Spent: ${V.globalSpent}</span><span>Limit: ${V.globalLimit}</span>
        </div>
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
          <span style="font-weight:700;font-size:15px">Categories in budget</span>
          <button data-click="${H(() => openModal('budget', null, { category: (unbudgeted()[0] || {}).id || '', limit: '150' }))}" style="border:0;background:transparent;color:${ACCENT};font-weight:600;cursor:pointer;font-size:13.5px;display:flex;align-items:center;gap:6px;padding:0">
            <svg width="16" height="16"><use href="#ic-plus"></use></svg>Add budget
          </button>
        </div>
        <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          ${V.budgetRows.map(b => `
            <button data-click="${H(b.onClick)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid ${TH.border};background:${TH.surface};padding:13px 16px;display:flex;align-items:center;gap:13px;cursor:pointer">
              <span style="width:40px;height:40px;border-radius:50%;background:${b.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="20" height="20"><use href="${b.icon}"></use></svg></span>
              <span style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
                <span style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
                  <span style="font-weight:600;font-size:14.5px">${b.name}</span>
                  <span style="font-weight:600;color:${b.barColor};font-variant-numeric:tabular-nums">${b.left}</span>
                </span>
                <span style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:12px;font-weight:600;color:${b.barColor};font-variant-numeric:tabular-nums;width:38px">${b.pct}</span>
                  <span style="flex:1;height:8px;border-radius:4px;background:${TH.border};overflow:hidden;display:block">
                    <span style="display:block;height:100%;width:${b.width};background:${b.barColor};transition:width .4s ease"></span>
                  </span>
                </span>
                <span style="display:flex;justify-content:space-between;font-size:12.5px;color:${GREY};font-variant-numeric:tabular-nums">
                  <span>Spent: ${b.spent}</span><span>Limit: ${b.limit}</span>
                </span>
              </span>
            </button>`).join('')}
          ${V.noBudgets ? `<div style="padding:34px 20px;text-align:center;color:${GREY}">No budgets yet. Pick a category below.</div>` : ''}
        </div>
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <span style="font-weight:700;font-size:15px;padding:0 4px">Without budget</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px">
          ${V.unbudgeted.map(u => `
            <button data-click="${H(u.onClick)}" style="background:${TH.surface};border:0;border-radius:14px;padding:14px 10px 16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
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
    <nav style="position:fixed;left:0;right:0;bottom:0;z-index:30;background:${TH.surface};border-top:1px solid ${TH.border};display:grid;grid-template-columns:repeat(5,1fr);padding:6px 4px 8px">
      ${V.navItems.map(n => `
        <button data-click="${H(n.onClick)}" style="border:0;background:transparent;padding:4px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;color:${n.color}">
          <span style="padding:4px 16px;border-radius:14px;background:${n.pill};display:grid;place-items:center"><svg width="22" height="22"><use href="${n.icon}"></use></svg></span>
          <span style="font-size:11px;font-weight:${n.weight}">${n.label}</span>
        </button>`).join('')}
    </nav>`;

  const drawer = !V.drawerOpen ? '' : `
    <div data-click="${H(() => { state.drawerOpen = false; render(); })}" style="position:fixed;inset:0;z-index:60;background:rgba(20,24,32,0.42);animation:kb-in .18s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="width:min(300px,82vw);height:100%;background:${TH.surface2};display:flex;flex-direction:column;box-shadow:4px 0 24px rgba(16,24,40,0.2)">
        <div style="background:${TH.hero};padding:22px 20px 18px;display:flex;flex-direction:column;gap:10px">
          <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;display:grid;place-items:center;overflow:hidden"><img src="cat-logo.png" alt="MerlitoMoney" style="width:74%;height:74%;object-fit:contain"></span>
          <span style="font-weight:700;font-size:19px">MerlitoMoney</span>
        </div>
        <div style="padding:14px 16px 4px">${themeSettingsHtml()}</div>
        ${V.drawerItems.map(d => `
          <button data-click="${H(() => { state.drawerOpen = false; render(); })}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px">
            <svg width="21" height="21" style="color:${GREY}"><use href="${d.icon}"></use></svg>${d.label}
          </button>`).join('')}
        <button data-click="${H(() => logoutAction())}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${RED};margin-top:auto">
          <svg width="21" height="21"><use href="#ic-close"></use></svg>Log out
        </button>
      </div>
    </div>`;

  const modal = !V.showModal ? '' : `
    <div data-click="${H(() => { state.modal = null; render(); })}" style="position:fixed;inset:0;z-index:70;background:rgba(20,24,32,0.42);display:flex;align-items:center;justify-content:center;padding:16px;animation:kb-in .16s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="background:${TH.surface2};border-radius:22px;width:100%;max-width:460px;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(16,24,40,0.3);animation:kb-up .2s ease both">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;position:sticky;top:0;background:${TH.surface2};z-index:2">
          <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;background:transparent;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex:none"><svg width="20" height="20"><use href="#ic-close"></use></svg></button>
          <span style="font-size:19px;font-weight:700;flex:1">${V.modalTitle}</span>
          ${V.isSettingsModal ? '' : `<button data-click="${H(() => submit())}" style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:9px 16px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:7px">${V.modalCta}</button>`}
        </div>
        <div style="padding:0 18px 20px;display:flex;flex-direction:column;gap:14px">
          ${V.isMovementModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;gap:6px;border-bottom:1px solid ${TH.border}">
                ${V.movementTabs.map(t => `
                  <button data-click="${H(() => { set('movement', t.value); render(); })}" style="flex:1;border:0;border-bottom:2.5px solid ${t.underline};background:transparent;color:${t.color};font-weight:${t.weight};padding:10px 4px;cursor:pointer">${t.label}</button>`).join('')}
              </div>
              <div style="background:${TH.surface};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px;align-items:center">
                <span style="font-size:12px;color:${GREY};letter-spacing:0.06em;text-transform:uppercase">${V.movementKind}</span>
                <input id="f-amount" value="${esc(V.formAmount)}" placeholder="0,00 €" inputmode="decimal" style="border:0;background:transparent;text-align:center;font-size:30px;font-weight:700;width:100%;font-variant-numeric:tabular-nums;outline:none">
                <span style="font-size:12.5px;color:${GREY}">${V.todayLabel}</span>
              </div>
              ${!V.isTransferMovement ? `
                <div style="display:flex;flex-wrap:wrap;gap:8px">
                  ${V.movementCats.map(c => `
                    <button data-click="${H(() => { set('category', c.id); render(); })}" style="border:0;border-radius:11px;padding:9px 14px;cursor:pointer;background:${c.bg};color:${c.color};font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:8px;opacity:${c.opacity}">
                      <svg width="16" height="16"><use href="${c.icon}"></use></svg>${c.name}
                    </button>`).join('')}
                </div>` : ''}
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Account
                <select data-change="${H(e => { set('account', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.accountOptions.map(o => `<option value="${o.v}" ${o.v === V.formAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              ${V.isTransferMovement ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">To account
                  <select data-change="${H(e => { set('toAccount', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.toAccountOptions.map(o => `<option value="${o.v}" ${o.v === V.formToAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
            </div>` : ''}

          ${V.isAccountModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="background:${TH.surface};border-radius:14px;padding:6px 14px">
                ${V.accountKinds.map(k => `
                  <button data-click="${H(() => { set('kind', k.value); render(); })}" style="width:100%;border:0;background:transparent;padding:12px 0;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
                    <span style="width:20px;height:20px;border-radius:50%;border:2px solid ${k.ring};display:grid;place-items:center;flex:none">
                      <span style="width:10px;height:10px;border-radius:50%;background:${k.dot}"></span>
                    </span>
                    <span style="flex:1;font-weight:500">${k.label}</span>
                    <svg width="20" height="20" style="color:${GREY}"><use href="${k.icon}"></use></svg>
                  </button>`).join('')}
              </div>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Name
                <input id="f-name" value="${esc(V.formName)}" placeholder="e.g. Everyday account" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Type
                  <select data-change="${H(e => { set('type', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${['Bank', 'Cash', 'Wallet', 'Card'].map(t => `<option value="${t}" ${t === V.formType ? 'selected' : ''}>${t === 'Wallet' ? 'Digital wallet' : t}</option>`).join('')}
                  </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Initial balance
                  <input id="f-balance" value="${esc(V.formBalance)}" placeholder="0,00" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>
              </div>
              ${V.isSavingsKind ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Savings goal
                  <input id="f-goal" value="${esc(V.formGoal)}" placeholder="10.000" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>` : ''}
            </div>` : ''}

          ${V.isCatModal ? `
            <div style="display:flex;flex-direction:column;gap:16px">
              <div style="display:flex;align-items:center;gap:14px;background:${TH.surface};border-radius:14px;padding:14px">
                <span style="width:56px;height:56px;border-radius:50%;background:${V.formColor};color:#fff;display:grid;place-items:center;flex:none"><svg width="28" height="28"><use href="${V.formIconRef}"></use></svg></span>
                <input id="f-name" value="${esc(V.formName)}" placeholder="Category name" style="flex:1;border:0;border-bottom:1.5px solid ${TH.border};padding:8px 2px;font-size:17px;font-weight:600;background:transparent;outline:none">
              </div>
              <div style="display:flex;flex-direction:column;gap:9px">
                <span style="font-size:12px;font-weight:600;color:${GREY};text-transform:uppercase;letter-spacing:0.06em">Icon</span>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:8px;background:${TH.surface};border-radius:14px;padding:12px">
                  ${V.iconChoices.map(i => `
                    <button data-click="${H(() => { set('icon', i.value); render(); })}" style="aspect-ratio:1;border:1.5px solid ${i.border};background:${i.bg};border-radius:50%;cursor:pointer;display:grid;place-items:center;color:${i.fg}"><svg width="21" height="21"><use href="${i.ref}"></use></svg></button>`).join('')}
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:9px">
                <span style="font-size:12px;font-weight:600;color:${GREY};text-transform:uppercase;letter-spacing:0.06em">Colour</span>
                <div style="display:flex;flex-wrap:wrap;gap:9px;background:${TH.surface};border-radius:14px;padding:12px">
                  ${V.colorChoices.map(c => `
                    <button data-click="${H(() => { set('color', c.value); render(); })}" style="width:32px;height:32px;border-radius:50%;background:${c.value};border:3px solid ${c.ring};cursor:pointer;padding:0"></button>`).join('')}
                </div>
              </div>
              ${V.canDelete ? `
                <button data-click="${H(() => deleteCategoryAction())}" style="border:0;background:${TH.surface};color:#d93a34;border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-trash"></use></svg>Delete category
                </button>` : ''}
            </div>` : ''}

          ${V.isBudgetModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Category
                <select data-change="${H(e => { set('category', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.budgetCatOptions.map(o => `<option value="${o.v}" ${o.v === V.formCategory ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Monthly limit
                <input id="f-limit" value="${esc(V.formLimit)}" placeholder="0" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
              </label>
              <div style="font-size:13px;color:${GREY};background:${TH.surface};border-radius:12px;padding:12px 14px">${V.budgetHint}</div>
              ${V.canRemoveBudget ? `
                <button data-click="${H(() => removeBudgetAction())}" style="border:0;background:${TH.surface};color:#d93a34;border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-trash"></use></svg>Remove budget
                </button>` : ''}
            </div>` : ''}

          ${V.isSettingsModal ? `
            ${themeSettingsHtml()}
            <div style="display:flex;flex-direction:column;gap:2px;background:${TH.surface};border-radius:14px;overflow:hidden">
              <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-db"></use></svg>Data
              </button>
              <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-refresh"></use></svg>Backups
              </button>
              <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-info"></use></svg>About
              </button>
              <button data-click="${H(() => logoutAction())}" style="border:0;background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${RED}">
                <svg width="20" height="20"><use href="#ic-close"></use></svg>Log out
              </button>
            </div>` : ''}
        </div>
      </div>
    </div>`;

  if (V.isNarrow) {
    return `<div style="min-height:100vh;display:flex;flex-direction:column;font-size:15px">${header}${main}${bottomNav}${drawer}${modal}</div>`;
  }

  const sidebar = `
    <aside style="width:230px;flex:none;background:${TH.surface};border-right:1px solid ${TH.border};position:sticky;top:0;align-self:flex-start;height:100vh;overflow-y:auto;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:11px;padding:18px 18px 16px;background:${TH.hero}">
        <span style="width:36px;height:36px;border-radius:11px;background:#ffd43b;display:grid;place-items:center;overflow:hidden;flex:none"><img src="cat-logo.png" alt="" style="width:74%;height:74%;object-fit:contain"></span>
        <span style="font-weight:700;font-size:15.5px">MerlitoMoney</span>
      </div>
      <nav style="display:flex;flex-direction:column;padding:10px 0;gap:1px;flex:1">
        ${V.navItems.map(n => `
          <button data-click="${H(n.onClick)}" style="border:0;border-left:3px solid ${n.pill !== 'transparent' ? ACCENT : 'transparent'};background:${n.pill};color:${n.color};font-weight:${n.weight};padding:11px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;font-size:14.5px;text-align:left">
            <svg width="19" height="19"><use href="${n.icon}"></use></svg>${n.label}
          </button>`).join('')}
      </nav>
      <div style="padding:8px 0;border-top:1px solid ${TH.border}">
        <button data-click="${H(() => openModal('settings'))}" style="width:100%;border:0;background:transparent;color:${GREY};font-weight:400;padding:11px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;font-size:14.5px;text-align:left">
          <svg width="19" height="19"><use href="#ic-gear"></use></svg>Settings
        </button>
      </div>
    </aside>`;

  return `<div style="min-height:100vh;display:flex;font-size:15px">${sidebar}<div style="flex:1;min-width:0;display:flex;flex-direction:column">${header}${main}</div>${modal}</div>`;
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
