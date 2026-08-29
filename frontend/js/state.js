import { PAL } from './constants.js';

export function loadThemePref(key, fallback) {
  try { const v = localStorage.getItem(key); return v || fallback; } catch (e) { return fallback; }
}
export function saveThemePref(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

export const state = {
  authed: false, loginError: '',
  accounts: [], cats: [], tx: [], budgets: {},
  mode: 'month', anchor: new Date(), view: 'expenses',
  fAccounts: [], fTypes: [], fCats: [], filtersOpen: false,
  narrow: window.matchMedia('(max-width: 859px)').matches,
  drawerOpen: false, modal: null, editId: null, formError: '',
  themeStyle: loadThemePref('mm_theme_style', 'colorful'),
  themeMode: loadThemePref('mm_theme_mode', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  form: { name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: '', toAccount: '', icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense', iban: '', note: '' }
};

// Debug instrumentation: state.page is the one piece of state a user has
// reported changing unexpectedly (closing the "add account" modal jumping
// to Overview) with no reproducible cause found by reading the code. This
// setter prints a stack trace on every change so the real trigger — a bug
// here, a stale cached build, or something outside this module entirely —
// shows up directly in the browser console instead of requiring more guesses.
let _page = 'overview';
Object.defineProperty(state, 'page', {
  enumerable: true,
  get() { return _page; },
  set(v) {
    if (v !== _page) console.trace('[mm debug] state.page:', _page, '->', v);
    _page = v;
  }
});
