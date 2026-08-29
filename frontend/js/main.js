import { state } from './state.js';
import { api, loadAll } from './api.js';
import { render, wireOnce } from './render.js';

// ---------- bootstrap ----------
async function boot() {
  console.log('[mm debug] boot() — fresh app load/reload');
  try {
    const me = await api('/api/me');
    if (me.authed) { state.authed = true; await loadAll(); }
  } catch (e) { /* ignore */ }
  const root = document.getElementById('root');
  wireOnce(root);
  render();

  window.matchMedia('(max-width: 859px)').addEventListener('change', e => { state.narrow = e.matches; render(); });

  root.addEventListener('submit', async e => {
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
