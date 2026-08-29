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
  page: 'overview', mode: 'month', anchor: new Date(), view: 'expenses',
  fAccounts: [], fTypes: [], fCats: [], filtersOpen: false,
  narrow: window.matchMedia('(max-width: 859px)').matches,
  drawerOpen: false, modal: null, editId: null, formError: '',
  themeStyle: loadThemePref('mm_theme_style', 'colorful'),
  themeMode: loadThemePref('mm_theme_mode', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  form: { name: '', type: 'Bank', balance: '', goal: '', limit: '', category: '', amount: '', account: '', toAccount: '', icon: 'ic-cart', color: PAL[0], kind: 'spend', movement: 'Expense', iban: '' }
};
