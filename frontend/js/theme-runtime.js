import { THEMES } from './themes.js';
import { state } from './state.js';

// Mutated only by applyTheme() below; every other module just reads these
// live bindings, so they always reflect the theme picked on the last render.
export let TH = null, ACCENT = null, GREY = null;

export function currentTheme() {
  const style = THEMES[state.themeStyle] ? state.themeStyle : 'colorful';
  const mode = THEMES[style][state.themeMode] ? state.themeMode : 'light';
  return THEMES[style][mode];
}

export function applyTheme() {
  TH = currentTheme();
  ACCENT = TH.accent;
  GREY = TH.textSoft;
  document.body.style.background = TH.pageBg;
  document.body.style.color = TH.text;
}
