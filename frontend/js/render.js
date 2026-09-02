import { state } from './state.js';
import { TH, ACCENT, GREY, applyTheme } from './theme-runtime.js';
import { THEME_STYLES, THEMES } from './themes.js';
import { saveThemePref } from './state.js';
import { RED, GREEN } from './constants.js';
import { computeView, set, openModal, shiftPeriod, unbudgeted } from './viewmodel.js';
import { submit, deleteCategoryAction, removeBudgetAction, closeAccountAction, deleteAccountAction, pauseRecurringAction, resumeRecurringAction, deleteRecurringAction, deleteMovementAction, deleteAllDataAction, changePasswordAction, logoutAction, downloadTransactionsCsv, downloadBackup, pickBackupFile, restoreBackupAction, openAboutModal, commitImportAction, cancelImportAction, syncBankAction, openConnectBank, openBankSetup, copyRedirectUrl, saveBankAppId, pickBankKeyFile, clearBankConfigAction, testBankConnectionAction } from './actions.js';

// ---------- event delegation ----------
export let handlers = [];
export function H(fn) { handlers.push(fn); return handlers.length - 1; }

// One listener per event type, attached once to the stable #root element
// (only its children are ever replaced, via innerHTML — #root itself never
// is). The previous approach re-attached a fresh listener to every matching
// element on every render; when a click's own handler replaced the whole
// DOM mid-bubble (e.g. closing a modal), the still-bubbling event could
// reach a handler on a freshly-rendered element it was never meant to hit —
// this is what caused closing the "add account" modal to also trigger the
// Overview nav button underneath it. A single delegated listener on a node
// that's never itself torn down avoids that whole failure class.
// Selecting text (e.g. an error message) with a drag that overshoots the
// modal box releases the mouse over the backdrop, and a plain click listener
// can't tell that apart from an actual "close the modal" click — both fire
// with the backdrop as the target. Tracking where the drag *started* fixes
// it: a backdrop click only closes the modal if the mousedown was on the
// backdrop too, not merely the mouseup that produced the click.
let mouseDownTarget = null;

export function wireOnce(root) {
  root.addEventListener('mousedown', e => { mouseDownTarget = e.target; });
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-click]');
    if (el) {
      if (el.dataset.backdrop === '1' && mouseDownTarget !== el) return;
      handlers[+el.dataset.click](e);
    }
  });
  root.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el) handlers[+el.dataset.change](e);
  });
}
export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function themeSettingsHtml() {
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
      <div style="height:1px;background:${TH.border};margin:2px 0"></div>
      <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em">Number format</span>
      <div style="display:flex;gap:8px">
        ${[['comma', '1.234,56'], ['point', '1,234.56']].map(([f, example]) => {
          const on = state.numberFormat === f;
          return `<button data-click="${H(() => { state.numberFormat = f; saveThemePref('mm_number_format', f); render(); })}" style="flex:1;border:1.5px solid ${on ? ACCENT : TH.border};background:${on ? TH.accentSoft : 'transparent'};color:${on ? ACCENT : TH.text};border-radius:10px;padding:9px;cursor:pointer;font-weight:600;font-size:13.5px;font-variant-numeric:tabular-nums">${example}</button>`;
        }).join('')}
      </div>
    </div>`;
}

// ---------- rendering ----------
export function render() {
  applyTheme();
  handlers = [];
  const root = document.getElementById('root');
  root.innerHTML = state.authed ? renderApp() : renderLogin();
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
  const ibanInput = root.querySelector('#f-iban');
  if (ibanInput) ibanInput.addEventListener('input', e => set('iban', e.target.value));
  const noteInput = root.querySelector('#f-note');
  if (noteInput) noteInput.addEventListener('input', e => set('note', e.target.value));
  const dangerPwInput = root.querySelector('#f-danger-password');
  if (dangerPwInput) dangerPwInput.addEventListener('input', e => set('dangerPassword', e.target.value));
  const dangerConfirmInput = root.querySelector('#f-danger-confirm');
  if (dangerConfirmInput) dangerConfirmInput.addEventListener('input', e => set('dangerConfirm', e.target.value));
  const curPwInput = root.querySelector('#f-current-password');
  if (curPwInput) curPwInput.addEventListener('input', e => set('currentPassword', e.target.value));
  const newPwInput = root.querySelector('#f-new-password');
  if (newPwInput) newPwInput.addEventListener('input', e => set('newPassword', e.target.value));
  const confirmPwInput = root.querySelector('#f-confirm-new-password');
  if (confirmPwInput) confirmPwInput.addEventListener('input', e => set('confirmNewPassword', e.target.value));
  const loanRateInput = root.querySelector('#f-loan-rate');
  if (loanRateInput) loanRateInput.addEventListener('input', e => set('loanRate', e.target.value));
  const loanTermInput = root.querySelector('#f-loan-term');
  if (loanTermInput) loanTermInput.addEventListener('input', e => set('loanTermMonths', e.target.value));
  const extraPaymentAmountInput = root.querySelector('#f-extra-payment-amount');
  if (extraPaymentAmountInput) extraPaymentAmountInput.addEventListener('input', e => set('extraPaymentAmount', e.target.value));
  const backupPwInput = root.querySelector('#f-backup-password');
  if (backupPwInput) backupPwInput.addEventListener('input', e => set('backupPassword', e.target.value));
  const backupConfirmInput = root.querySelector('#f-backup-confirm');
  if (backupConfirmInput) backupConfirmInput.addEventListener('input', e => set('backupConfirm', e.target.value));
  const bankAppIdInput = root.querySelector('#f-bank-app-id');
  if (bankAppIdInput) bankAppIdInput.addEventListener('input', e => set('bankAppId', e.target.value));
  const pwInput = root.querySelector('#f-password');
  if (pwInput) pwInput.focus();
}

export function renderLogin() {
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

export function iconBtn(V, ariaLabel, iconId, size, onClick, extraStyle) {
  return `<button data-click="${H(onClick)}" aria-label="${ariaLabel}" style="border:0;background:transparent;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none${extraStyle || ''}"><svg width="${size}" height="${size}"><use href="#${iconId}"></use></svg></button>`;
}

export function renderApp() {
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
      ${iconBtn(V, 'Search', 'ic-search', 20, () => { state.page = 'balance'; state.balanceTab = 'movements'; state.filtersOpen = true; render(); })}
    </div>

    ${V.isOverview ? '' : `
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
    </div>`}

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
            <span style="font-weight:600;color:${g.totalColor};font-variant-numeric:tabular-nums">${g.total}</span>
          </div>
          ${g.items.map(a => `
            <div style="width:100%;border-bottom:1px solid ${TH.border};background:${TH.surface};display:flex;align-items:center;gap:2px;padding:6px 10px 6px 18px">
              <button data-click="${H(a.onClick)}" style="flex:1;min-width:0;text-align:left;border:0;background:transparent;padding:8px 0;display:flex;align-items:center;gap:14px;cursor:pointer">
                <span style="width:42px;height:42px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="21" height="21"><use href="${a.icon}"></use></svg></span>
                <span style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0">
                  <span style="display:flex;align-items:baseline;gap:8px">
                    <span style="font-weight:600">${a.name}</span>
                    <span style="font-size:12px;color:${GREY}">${a.type}</span>
                  </span>
                  <span style="font-weight:600;color:${a.balanceColor};font-variant-numeric:tabular-nums">${a.balance}</span>
                  ${a.hasGoal ? `
                    <span style="display:flex;align-items:center;gap:9px;margin-top:2px">
                      <span style="flex:1;height:7px;border-radius:4px;background:#e9ebef;overflow:hidden;display:block">
                        <span style="display:block;height:100%;width:${a.goalPct};background:#40c057"></span>
                      </span>
                      <span style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${a.goalLabel}</span>
                    </span>` : ''}
                  ${a.hasUtil ? `
                    <span style="display:flex;align-items:center;gap:9px;margin-top:2px">
                      <span style="flex:1;height:7px;border-radius:4px;background:#e9ebef;overflow:hidden;display:block">
                        <span style="display:block;height:100%;width:${a.utilPct};background:${a.utilColor}"></span>
                      </span>
                      <span style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${a.utilLabel}</span>
                    </span>` : ''}
                  ${a.hasPayoff ? `
                    <span style="display:flex;align-items:center;gap:9px;margin-top:2px">
                      <span style="flex:1;height:7px;border-radius:4px;background:#e9ebef;overflow:hidden;display:block">
                        <span style="display:block;height:100%;width:${a.payoffPct};background:#40c057"></span>
                      </span>
                      <span style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${a.payoffLabel}</span>
                    </span>` : ''}
                  ${a.autopayLabel ? `<span style="font-size:12px;color:${TH.textFaint}">${a.autopayLabel}</span>` : ''}
                  ${a.loanLabel ? `<span style="font-size:12px;color:${TH.textFaint}">${a.loanLabel}</span>` : ''}
                </span>
                <span style="font-size:12px;color:${TH.textFaint};text-align:right;flex:none">${a.meta}</span>
              </button>
              ${a.isLoan ? `<button data-click="${H(a.onExtraPayment)}" aria-label="Add extra payment on ${esc(a.name)}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="16" height="16"><use href="#ic-piggy"></use></svg></button>` : ''}
              <button data-click="${H(a.onToggleNetWorth)}" aria-label="${a.includedInNetWorth ? 'Exclude' : 'Include'} ${esc(a.name)} from net worth" title="${a.includedInNetWorth ? 'Counted in net worth — click to exclude' : 'Excluded from net worth — click to include'}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${a.includedInNetWorth ? GREY : TH.textFaint};flex:none"><svg width="16" height="16"><use href="#${a.includedInNetWorth ? 'ic-eye' : 'ic-eye-off'}"></use></svg></button>
              <button data-click="${H(a.onEdit)}" aria-label="Edit ${esc(a.name)}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="16" height="16"><use href="#ic-edit"></use></svg></button>
              <button data-click="${H(a.onDelete)}" aria-label="Delete ${esc(a.name)}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="16" height="16"><use href="#ic-trash"></use></svg></button>
            </div>`).join('')}
        </section>`).join('')}
      <button data-click="${H(() => openModal('account'))}" style="align-self:flex-start;border:1px solid ${TH.border};background:${TH.surface};border-radius:12px;padding:11px 18px;cursor:pointer;font-weight:600;color:${ACCENT};display:flex;align-items:center;gap:8px">
        <svg width="18" height="18"><use href="#ic-plus"></use></svg>Add account
      </button>
      ${V.closedAccounts.length ? `
        <section style="display:flex;flex-direction:column;gap:8px">
          <span style="font-weight:600;font-size:13px;color:${GREY};padding:0 4px">Closed accounts</span>
          <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            ${V.closedAccounts.map(a => `
              <div style="width:100%;border-bottom:1px solid ${TH.border};display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;opacity:0.7">
                <span style="width:34px;height:34px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="16" height="16"><use href="${a.icon}"></use></svg></span>
                <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
                  <span style="font-weight:600;font-size:13.5px">${a.name}</span>
                  <span style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${a.balance}</span>
                </span>
                <button data-click="${H(a.onReopen)}" style="border:0;background:transparent;color:${ACCENT};font-weight:600;font-size:12.5px;cursor:pointer;padding:6px 8px;flex:none">Reopen</button>
                <button data-click="${H(a.onDelete)}" aria-label="Delete ${esc(a.name)}" style="border:0;background:transparent;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="15" height="15"><use href="#ic-trash"></use></svg></button>
              </div>`).join('')}
          </div>
        </section>` : ''}
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
      <div style="display:flex;gap:6px;border-bottom:1px solid ${TH.border}">
        ${V.balanceTabs.map(t => `
          <button data-click="${H(t.onClick)}" style="flex:1;border:0;border-bottom:2.5px solid ${t.underline};background:transparent;color:${t.color};font-weight:${t.weight};padding:10px 4px;cursor:pointer">${t.label}</button>`).join('')}
      </div>
      ${V.showRecurringTab ? `
        <section style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          ${V.recurringRows.map(r => `
            <div style="width:100%;border-bottom:1px solid ${TH.border};display:flex;align-items:center;gap:2px;padding:6px 10px 6px 18px;opacity:${r.dimmed ? '0.6' : '1'}">
              <button data-click="${H(r.onClick)}" style="flex:1;min-width:0;text-align:left;border:0;background:transparent;padding:8px 0;display:flex;align-items:center;gap:14px;cursor:pointer">
                <span style="width:42px;height:42px;border-radius:50%;background:${r.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="21" height="21"><use href="${r.icon}"></use></svg></span>
                <span style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0">
                  <span style="display:flex;align-items:baseline;gap:8px">
                    <span style="font-weight:600">${r.name}</span>
                    <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${r.amountColor}">${r.amount}</span>
                  </span>
                  <span style="font-size:12px;color:${GREY}">${r.freqLabel}</span>
                  <span style="font-size:12px;color:${r.nextColor}">${r.nextLabel} · ${r.account}</span>
                </span>
              </button>
              <button data-click="${H(r.onEdit)}" aria-label="Edit ${esc(r.name)}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="16" height="16"><use href="#ic-edit"></use></svg></button>
              <button data-click="${H(r.onDelete)}" aria-label="Delete ${esc(r.name)}" style="border:0;background:transparent;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="16" height="16"><use href="#ic-trash"></use></svg></button>
            </div>`).join('')}
          ${V.noRecurring ? `<div style="padding:34px 20px;text-align:center;color:${GREY}">No subscriptions or loans yet.</div>` : ''}
        </section>
        <button data-click="${H(() => openModal('recurring', null, { recurMovement: 'Expense', category: (state.cats.find(c => c.kind === 'expense') || {}).id || '' }))}" style="align-self:flex-start;border:1px solid ${TH.border};background:${TH.surface};border-radius:12px;padding:11px 18px;cursor:pointer;font-weight:600;color:${ACCENT};display:flex;align-items:center;gap:8px">
          <svg width="18" height="18"><use href="#ic-plus"></use></svg>Add recurring
        </button>` : `
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
                <div style="display:flex;align-items:center;gap:2px;padding:2px 6px 2px 16px;border-bottom:1px solid ${TH.border}">
                  <div style="flex:1;min-width:0;display:flex;align-items:center;gap:13px;padding:10px 0">
                    <span style="width:38px;height:38px;border-radius:50%;background:${t.color};color:#fff;display:grid;place-items:center;flex:none"><svg width="19" height="19"><use href="${t.icon}"></use></svg></span>
                    <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                      <span style="font-weight:600;font-size:14.5px">${t.title}</span>
                      <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${GREY}">
                        <svg width="13" height="13"><use href="${t.accountIcon}"></use></svg>${t.account}
                      </span>
                      ${t.note ? `<span style="font-size:12.5px;color:${TH.textFaint};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.note)}</span>` : ''}
                    </span>
                    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none">
                      <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${t.amountColor}">${t.amount}</span>
                      <span style="font-size:11.5px;color:${TH.textFaint}">${t.type}</span>
                    </span>
                  </div>
                  <button data-click="${H(t.onEdit)}" aria-label="Edit movement" style="border:0;background:transparent;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="15" height="15"><use href="#ic-edit"></use></svg></button>
                  <button data-click="${H(t.onDelete)}" aria-label="Delete movement" style="border:0;background:transparent;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${GREY};flex:none"><svg width="15" height="15"><use href="#ic-trash"></use></svg></button>
                </div>`).join('')}
            </div>`).join('')}
          ${V.noRows ? `<div style="padding:44px 20px;text-align:center;color:${GREY}">No movements match these filters.</div>` : ''}
        </section>`}
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
            <span style="display:flex;align-items:baseline;gap:6px">
              <span style="font-weight:700;font-size:15px">Net worth</span>
              <span style="font-size:11px;color:${TH.textFaint}">Last 6 months</span>
            </span>
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

      ${V.hasLoanPayoff ? `
      <section style="background:${TH.surface};border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">
          <span style="font-weight:700;font-size:15px">Loan payoff projection</span>
          <span style="font-size:12px;color:${GREY}">Estimated payoff: ${V.loanPayoffTrend.payoffLabel}</span>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <span style="display:flex;flex-direction:column;gap:1px">
            <span style="font-size:11px;color:${GREY};display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:#e8890c;display:inline-block"></span>Owed today</span>
            <span style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums">${V.loanPayoffTrend.current}</span>
          </span>
          <span style="display:flex;flex-direction:column;gap:1px">
            <span style="font-size:11px;color:${GREY};display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:#5c7cfa;display:inline-block"></span>Interest paid to date</span>
            <span style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums">${V.loanPayoffTrend.interestPaid}</span>
          </span>
        </div>
        <svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:90px;display:block;overflow:visible">
          <path d="${V.loanPayoffTrend.area}" fill="#e8890c1f" stroke="none"></path>
          <line x1="${V.loanPayoffTrend.todayX}" y1="0" x2="${V.loanPayoffTrend.todayX}" y2="34" stroke="${TH.textFaint}" stroke-width="1" stroke-dasharray="2,2" vector-effect="non-scaling-stroke"></line>
          <path d="${V.loanPayoffTrend.interestPath}" fill="none" stroke="#5c7cfa" stroke-width="1.3" vector-effect="non-scaling-stroke"></path>
          <path d="${V.loanPayoffTrend.path}" fill="none" stroke="#e8890c" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:${TH.textFaint}">
          ${V.loanPayoffTrend.labels.map(l => `<span>${l}</span>`).join('')}
        </div>
        <span style="font-size:11px;color:${TH.textFaint}">Orange: balance owed. Blue: cumulative interest paid. Dashed line marks today — everything after it is a projection assuming today's rate and no further prepayments.</span>
      </section>` : ''}

      <section style="background:${TH.surface};border-radius:16px;padding:16px 16px 12px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        <span style="font-weight:700;font-size:15px;display:block;padding-bottom:10px">${V.spendChartTitle}</span>
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
          <span style="font-weight:700;font-size:15px;padding:0 4px">Top expense categories <span style="font-weight:500;color:${GREY};font-size:12.5px">· ${V.periodTitle}</span></span>
          <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            ${V.topExpenseCats.length ? catMiniList(V.topExpenseCats) : `<div style="padding:24px 16px;text-align:center;color:${GREY};font-size:13.5px">No expenses yet.</div>`}
          </div>
        </section>
        <section style="display:flex;flex-direction:column;gap:8px">
          <span style="font-weight:700;font-size:15px;padding:0 4px">Top income categories <span style="font-weight:500;color:${GREY};font-size:12.5px">· ${V.periodTitle}</span></span>
          <div style="background:${TH.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
            ${V.topIncomeCats.length ? catMiniList(V.topIncomeCats) : `<div style="padding:24px 16px;text-align:center;color:${GREY};font-size:13.5px">No income yet.</div>`}
          </div>
        </section>
      </div>

      ${V.dashboardAccounts.length ? `
      <section style="display:flex;flex-direction:column;gap:8px">
        <span style="font-weight:700;font-size:15px;padding:0 4px">Accounts</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:2px 4px 6px">
          ${V.dashboardAccounts.map(a => `
            <div style="position:relative;background:${TH.surface};border-radius:14px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
              <button data-click="${H(a.onClick)}" style="width:100%;border:0;background:transparent;padding:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer;text-align:left">
                <span style="width:32px;height:32px;border-radius:50%;background:${a.color};color:#fff;display:grid;place-items:center"><svg width="16" height="16"><use href="${a.icon}"></use></svg></span>
                <span style="font-size:12.5px;color:${GREY};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:20px">${a.name}</span>
                <span style="font-weight:600;font-variant-numeric:tabular-nums;font-size:14px">${a.balance}</span>
              </button>
              <button data-click="${H(a.onToggleNetWorth)}" aria-label="${a.includedInNetWorth ? 'Exclude' : 'Include'} ${esc(a.name)} from net worth" title="${a.includedInNetWorth ? 'Counted in net worth — click to exclude' : 'Excluded from net worth — click to include'}" style="position:absolute;top:8px;right:8px;border:0;background:${TH.surface2};width:24px;height:24px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:${a.includedInNetWorth ? GREY : TH.textFaint}"><svg width="12" height="12"><use href="#${a.includedInNetWorth ? 'ic-eye' : 'ic-eye-off'}"></use></svg></button>
            </div>`).join('')}
        </div>
      </section>` : ''}

      ${V.budgetWatch.length ? `
      <section style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 4px">
          <span style="font-weight:700;font-size:15px">Budget status <span style="font-weight:500;color:${GREY};font-size:12.5px">· ${V.periodTitle}</span></span>
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
                <span style="font-size:12px;color:${GREY};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.account} · ${t.date}${t.note ? ' · ' + esc(t.note) : ''}</span>
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

  const importPage = !V.isImport ? '' : `
    <div style="display:flex;flex-direction:column;gap:14px;animation:kb-up .25s ease both">
      ${V.importMsg ? `
        <div style="background:${TH.surface};border-radius:16px;padding:14px 16px;font-size:14px;border-left:4px solid ${ACCENT};white-space:pre-line;line-height:1.6">${esc(V.importMsg)}</div>` : ''}

      <section style="background:${TH.surface};border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:170px">
            <div style="font-weight:700;font-size:16px">Fetch from your bank</div>
            <div style="font-size:12.5px;color:${GREY}">
              ${!V.bankConfigured ? 'Bank import needs a one-time setup with your Enable Banking application.' : V.bankStatusLabel}
            </div>
          </div>
          ${V.bankConfigured ? `
            <select data-change="${H(e => { state.syncDays = e.target.value; render(); })}" style="border:1px solid ${TH.border};border-radius:10px;padding:8px 10px;background:${TH.surface};cursor:pointer;font-size:13.5px">
              ${V.syncDayOptions.map(o => `<option value="${o[0]}" ${o[0] === V.syncDays ? 'selected' : ''}>${o[1]}</option>`).join('')}
            </select>
            <button data-click="${H(() => openConnectBank())}" style="border:1px solid ${TH.border};background:transparent;border-radius:12px;padding:9px 15px;cursor:pointer;font-weight:600;font-size:13.5px;color:${TH.text}">Connect a bank</button>
            <button data-click="${H(() => syncBankAction())}" ${V.importBusy || !V.bankConnections.length ? 'disabled' : ''} style="border:0;background:${V.bankConnections.length ? ACCENT : TH.border};color:#fff;border-radius:12px;padding:10px 17px;cursor:${V.bankConnections.length ? 'pointer' : 'default'};font-weight:600;font-size:13.5px">${V.importBusy ? 'Fetching…' : 'Fetch now'}</button>
          ` : `
            <button data-click="${H(() => openBankSetup())}" style="border:0;background:${ACCENT};color:#fff;border-radius:12px;padding:10px 17px;cursor:pointer;font-weight:600;font-size:13.5px">Set up bank import</button>
          `}
        </div>
        ${V.bankConnections.length ? `
          <div style="display:flex;flex-direction:column">
            ${V.bankConnections.map(c => `
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-top:1px solid ${TH.border}">
                <div style="flex:1;min-width:140px">
                  <div style="font-weight:600;font-size:13.5px">${esc(c.name)} <span style="font-weight:400;color:${GREY}">· ${esc(c.country)}</span></div>
                  <div style="font-size:12px;color:${c.expiring ? RED : GREY}">${esc(c.statusLabel)}${c.expiry ? ' · ' + esc(c.expiry) : ''}</div>
                </div>
                ${c.canReconnect ? `<button data-click="${H(c.onReconnect)}" style="border:1px solid ${TH.border};background:transparent;color:${ACCENT};border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:12.5px">Reconnect</button>` : ''}
                ${c.canDisconnect ? `<button data-click="${H(c.onDisconnect)}" style="border:1px solid ${TH.border};background:transparent;color:${RED};border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:12.5px">Disconnect</button>` : ''}
              </div>`).join('')}
          </div>` : ''}
      </section>

      <section style="background:${TH.surface};border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,0.06)">
        <div style="font-weight:700;font-size:16px;margin-bottom:4px">Bank accounts</div>
        <div style="font-size:13px;color:${GREY};line-height:1.5;margin-bottom:${V.noFeeds ? '0' : '14px'}">
          ${!V.bankConfigured
            ? 'No bank is connected yet — set up bank import above to get started.'
            : V.noFeeds
              ? 'No bank is connected yet. Once a bank is linked, each account it reports shows up here to be matched with one of your own accounts.'
              : 'Each account your bank reports has to point at one of your own accounts before its transactions can be reviewed.'}
        </div>
        ${V.importFeeds.map(f => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid ${TH.border};flex-wrap:wrap">
            <div style="flex:1;min-width:160px">
              <div style="font-weight:600;font-size:14px">${esc(f.name)}</div>
              ${f.iban ? `<div style="font-size:12px;color:${GREY};font-variant-numeric:tabular-nums">${esc(f.iban)}</div>` : ''}
            </div>
            <select data-change="${H(f.onMap)}" style="border:1px solid ${TH.border};border-radius:10px;padding:8px 10px;background:${TH.surface};cursor:pointer;font-size:13.5px">
              ${f.accountOptions.map(o => `<option value="${o.v}" ${o.v === f.mappedTo ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
            </select>
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:${GREY}">
              <input type="checkbox" data-change="${H(f.onToggleSync)}" ${f.syncEnabled ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">Sync
            </label>
          </div>`).join('')}
      </section>

      ${V.noStaged ? `
        <section style="background:${TH.surface};border-radius:16px;padding:44px 20px;text-align:center;color:${GREY};box-shadow:0 1px 2px rgba(16,24,40,0.06)">
          Nothing waiting to be reviewed. Transactions fetched from your bank land here first — nothing reaches your accounts until you say so.
        </section>` : `
        <section style="background:${TH.surface};border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:150px">
              <div style="font-weight:700;font-size:16px">${V.stagedPending} to review</div>
              <div style="font-size:12.5px;color:${GREY}">${V.stagedReady} decided${V.stagedFlagged ? ` · ${V.stagedFlagged} look like duplicates` : ''}</div>
            </div>
            <button data-click="${H(() => cancelImportAction())}" ${V.importBusy ? 'disabled' : ''} style="border:1px solid ${TH.border};background:transparent;color:${RED};border-radius:12px;padding:9px 15px;cursor:pointer;font-weight:600;font-size:13.5px">Discard all</button>
            <button data-click="${H(() => commitImportAction())}" ${V.importBusy || !V.stagedReady ? 'disabled' : ''} style="border:0;background:${V.stagedReady ? ACCENT : TH.border};color:#fff;border-radius:12px;padding:10px 17px;cursor:${V.stagedReady ? 'pointer' : 'default'};font-weight:600;font-size:13.5px">Apply ${V.stagedReady || ''} decision${V.stagedReady === 1 ? '' : 's'}</button>
          </div>
        </section>

        <section style="background:${TH.surface};border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,0.06);overflow:hidden">
          ${V.importRows.map(r => `
            <div style="padding:14px 16px;border-bottom:1px solid ${TH.border};display:flex;flex-direction:column;gap:10px;${r.decided ? 'background:' + TH.accentSoft + '33' : ''}">
              <div style="display:flex;align-items:flex-start;gap:12px">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:14.5px">${esc(r.title)}</div>
                  <div style="font-size:12.5px;color:${GREY};display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-variant-numeric:tabular-nums">${r.date}</span>
                    <span>·</span>
                    <svg width="13" height="13"><use href="${r.accountIcon}"></use></svg>
                    <span>${esc(r.account)}</span>
                    <span>·</span>
                    <span>${esc(r.typeLabel)}</span>
                  </div>
                  ${r.detail ? `<div style="font-size:12px;color:${GREY};margin-top:2px">${esc(r.detail)}</div>` : ''}
                </div>
                <span style="font-weight:700;font-variant-numeric:tabular-nums;color:${r.amountColor};white-space:nowrap">${r.amount}</span>
              </div>

              ${r.pairNote ? `<div style="font-size:12.5px;color:${GREY};background:${TH.surface2};border-radius:10px;padding:8px 10px">${esc(r.pairNote)}</div>` : ''}

              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:${GREY}">
                <span>From</span>
                <select data-change="${H(r.onFrom)}" style="flex:1;min-width:130px;border:1px solid ${TH.border};border-radius:10px;padding:7px 9px;background:${TH.surface};cursor:pointer;font-size:12.5px;color:${TH.text}">
                  ${r.sideOptions.map(o => `<option value="${o.v}" ${o.v === r.fromAccount ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
                </select>
                <svg width="15" height="15" style="flex:none"><use href="#ic-right"></use></svg>
                <span>To</span>
                <select data-change="${H(r.onTo)}" style="flex:1;min-width:130px;border:1px solid ${TH.border};border-radius:10px;padding:7px 9px;background:${TH.surface};cursor:pointer;font-size:12.5px;color:${TH.text}">
                  ${r.sideOptions.map(o => `<option value="${o.v}" ${o.v === r.toAccount ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
                </select>
              </div>

              ${r.hasMatch ? `
                <div style="border:1px solid ${RED}55;background:${RED}0f;border-radius:10px;padding:9px 11px">
                  <div style="font-size:12.5px;font-weight:600;color:${RED};margin-bottom:2px">You may already have this one</div>
                  <div style="font-size:12.5px">${esc(r.matchText)}</div>
                  ${r.matchReason ? `<div style="font-size:11.5px;color:${GREY};margin-top:3px">${esc(r.matchReason)}</div>` : ''}
                </div>` : ''}

              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                ${r.buttons.map(b => `
                  <button data-click="${H(b.onClick)}" style="border:1px solid ${b.active ? ACCENT : TH.border};background:${b.active ? ACCENT : 'transparent'};color:${b.active ? '#fff' : GREY};border-radius:999px;padding:6px 13px;cursor:pointer;font-size:12.5px;font-weight:600">${b.label}</button>`).join('')}
                ${r.showCategory ? `
                  <select data-change="${H(r.onCategory)}" style="margin-left:auto;border:1px solid ${TH.border};border-radius:10px;padding:7px 10px;background:${TH.surface};cursor:pointer;font-size:12.5px">
                    ${r.catOptions.map(o => `<option value="${o.v}" ${o.v === r.category ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
                  </select>` : ''}
              </div>
            </div>`).join('')}
        </section>`}
    </div>`;

  const main = `<main style="flex:1;width:100%;background:${V.pageTint};transition:background .3s ease">
    <div style="max-width:${V.isNarrow ? '1080px' : '1600px'};margin:0 auto;padding:14px clamp(10px,2.4vw,28px) 110px;display:flex;flex-direction:column;gap:14px">
      ${accountsPage}${categoriesPage}${balancePage}${overviewPage}${budgetPage}${importPage}
    </div>
  </main>`;

  const bottomNav = !V.isNarrow ? '' : `
    <nav style="position:fixed;left:0;right:0;bottom:0;z-index:30;background:${TH.surface};border-top:1px solid ${TH.border};display:grid;grid-template-columns:repeat(${V.navItems.length},1fr);padding:6px 4px 8px">
      ${V.navItems.map(n => `
        <button data-click="${H(n.onClick)}" style="border:0;background:transparent;padding:4px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;color:${n.color}">
          <span style="padding:4px 16px;border-radius:14px;background:${n.pill};display:grid;place-items:center"><svg width="22" height="22"><use href="${n.icon}"></use></svg></span>
          <span style="font-size:11px;font-weight:${n.weight}">${n.label}</span>
        </button>`).join('')}
    </nav>`;

  const drawer = !V.drawerOpen ? '' : `
    <div data-click="${H(() => { state.drawerOpen = false; render(); })}" data-backdrop="1" style="position:fixed;inset:0;z-index:60;background:rgba(20,24,32,0.42);animation:kb-in .18s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="width:min(300px,82vw);height:100%;background:${TH.surface2};display:flex;flex-direction:column;box-shadow:4px 0 24px rgba(16,24,40,0.2)">
        <div style="background:${TH.hero};padding:22px 20px 18px;display:flex;flex-direction:column;gap:10px">
          <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;display:grid;place-items:center;overflow:hidden"><img src="cat-logo.png" alt="MerlitoMoney" style="width:74%;height:74%;object-fit:contain"></span>
          <span style="font-weight:700;font-size:19px">MerlitoMoney</span>
        </div>
        <div style="padding:14px 16px 4px">${themeSettingsHtml()}</div>
        <button data-click="${H(() => openModal('settings'))}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px">
          <svg width="21" height="21" style="color:${GREY}"><use href="#ic-gear"></use></svg>Settings
        </button>
        ${V.drawerItems.map(d => `
          <button data-click="${H(() => d.onClick())}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px">
            <svg width="21" height="21" style="color:${GREY}"><use href="${d.icon}"></use></svg>${d.label}
          </button>`).join('')}
        <button data-click="${H(() => logoutAction())}" style="border:0;background:transparent;text-align:left;padding:15px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${RED};margin-top:auto">
          <svg width="21" height="21"><use href="#ic-close"></use></svg>Log out
        </button>
      </div>
    </div>`;

  const modal = !V.showModal ? '' : `
    <div data-click="${H(() => { state.modal = null; render(); })}" data-backdrop="1" style="position:fixed;inset:0;z-index:70;background:rgba(20,24,32,0.42);display:flex;align-items:center;justify-content:center;padding:16px;animation:kb-in .16s ease both">
      <div data-click="${H(e => e.stopPropagation())}" style="background:${TH.surface2};border-radius:22px;width:100%;max-width:460px;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(16,24,40,0.3);animation:kb-up .2s ease both">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;position:sticky;top:0;background:${TH.surface2};z-index:2">
          <button data-click="${H(() => { state.modal = null; render(); })}" style="border:0;background:transparent;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex:none"><svg width="20" height="20"><use href="#ic-close"></use></svg></button>
          <span style="font-size:19px;font-weight:700;flex:1">${V.modalTitle}</span>
          ${V.isSettingsModal || V.isDeleteAccountModal || V.isDeleteRecurringModal || V.isDeleteMovementModal || V.isDeleteAllDataModal || V.isChangePasswordModal || V.isDataModal || V.isBackupsModal || V.isAboutModal || V.isConnectBankModal || V.isBankSetupModal || V.isDisconnectBankModal ? '' : `<button data-click="${H(() => submit())}" style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:9px 16px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:7px">${V.modalCta}</button>`}
        </div>
        <div style="padding:0 18px 20px;display:flex;flex-direction:column;gap:14px">
          ${V.isDeleteAccountModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                <strong style="color:${TH.text}">${esc(V.deleteAccountName)}</strong> has ${V.deleteAccountMovCount} movement${V.deleteAccountMovCount === 1 ? '' : 's'}. Closing keeps all of them and your net worth history intact — the account just won't accept new movements. Deleting removes the account and every one of its movements. This cannot be undone.
              </p>
              <button data-click="${H(() => closeAccountAction())}" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Close account — keep history</button>
              <button data-click="${H(() => deleteAccountAction())}" style="border:0;background:${TH.surface};color:${RED};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                <svg width="18" height="18"><use href="#ic-trash"></use></svg>Delete account &amp; all movements
              </button>
            </div>` : ''}

          ${V.isExtraPaymentModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                Extra principal payment on <strong style="color:${TH.text}">${esc(V.extraPaymentAccountName)}</strong> (currently owed: <strong style="color:${TH.text}">${V.extraPaymentOwed}</strong>). This reduces the debt immediately, and the next scheduled payment is recalculated for the remaining term automatically.
              </p>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Pay from
                <select data-change="${H(e => { set('extraPaymentFrom', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.extraPaymentFromOptions.map(o => `<option value="${o.v}" ${o.v === V.formExtraPaymentFrom ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Amount
                <input id="f-extra-payment-amount" value="${esc(V.formExtraPaymentAmount)}" placeholder="0,00" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Date
                <input type="date" data-change="${H(e => { set('extraPaymentDate', e.target.value); render(); })}" value="${V.formExtraPaymentDate}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none;color-scheme:${state.themeMode}">
              </label>
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
            </div>` : ''}

          ${V.isDeleteMovementModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                Delete <strong style="color:${TH.text}">${esc(V.deleteMovementTitle)}</strong> (<strong style="color:${TH.text}">${V.deleteMovementAmount}</strong>)? This cannot be undone.
              </p>
              <button data-click="${H(() => deleteMovementAction())}" style="border:0;background:${TH.surface};color:${RED};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                <svg width="18" height="18"><use href="#ic-trash"></use></svg>Delete movement
              </button>
            </div>` : ''}
          ${V.isMovementModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;gap:6px;border-bottom:1px solid ${TH.border}">
                ${V.movementTabs.map(t => `
                  <button data-click="${H(() => { set('movement', t.value); render(); })}" style="flex:1;border:0;border-bottom:2.5px solid ${t.underline};background:transparent;color:${t.color};font-weight:${t.weight};padding:10px 4px;cursor:pointer">${t.label}</button>`).join('')}
              </div>
              <div style="background:${TH.surface};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px;align-items:center">
                <span style="font-size:12px;color:${GREY};letter-spacing:0.06em;text-transform:uppercase">${V.movementKind}</span>
                <input id="f-amount" value="${esc(V.formAmount)}" placeholder="0,00 €" inputmode="decimal" style="border:0;background:transparent;text-align:center;font-size:30px;font-weight:700;width:100%;font-variant-numeric:tabular-nums;outline:none">
                <input type="date" data-change="${H(e => { set('date', e.target.value); render(); })}" value="${V.formDate}" style="border:0;background:transparent;text-align:center;font-size:12.5px;color:${GREY};cursor:pointer;outline:none;font-family:inherit;color-scheme:${state.themeMode}">
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
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Description (optional)
                <input id="f-note" value="${esc(V.formNote)}" placeholder="e.g. Weekly groceries" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
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
              ${V.isCreditKind || V.isLoanKind ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">${V.balanceLabel}
                  <input id="f-balance" value="${esc(V.formBalance)}" placeholder="0,00" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>` : `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Type
                  <select data-change="${H(e => { set('type', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${['Bank', 'Cash', 'Wallet', 'Card'].map(t => `<option value="${t}" ${t === V.formType ? 'selected' : ''}>${t === 'Wallet' ? 'Digital wallet' : t}</option>`).join('')}
                  </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">${V.balanceLabel}
                  <input id="f-balance" value="${esc(V.formBalance)}" placeholder="0,00" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>
              </div>`}
              ${V.isSavingsKind || V.isCreditKind || V.isLoanKind ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">${V.goalLabel}
                  <input id="f-goal" value="${esc(V.formGoal)}" placeholder="10.000" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                </label>` : ''}
              ${V.isCreditKind ? `
                <div style="height:1px;background:${TH.border};margin:4px 0"></div>
                <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
                  <input type="checkbox" data-change="${H(e => { set('autopayEnabled', e.target.checked); render(); })}" ${V.formAutopayEnabled ? 'checked' : ''} style="width:17px;height:17px;cursor:pointer">
                  <span style="font-size:13.5px">Autopay from a checking account</span>
                </label>
                ${V.formAutopayEnabled ? `
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Pay from
                    <select data-change="${H(e => { set('autopayFrom', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                      ${V.autopayFromOptions.map(o => `<option value="${o.v}" ${o.v === V.formAutopayFrom ? 'selected' : ''}>${o.l}</option>`).join('')}
                    </select>
                  </label>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Day of the month
                      <select data-change="${H(e => { set('autopayDay', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                        ${V.autopayDayOptions.map(o => `<option value="${o.v}" ${o.v === V.formAutopayDay ? 'selected' : ''}>${o.l}</option>`).join('')}
                      </select>
                    </label>
                    <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">If it lands on a weekend
                      <select data-change="${H(e => { set('autopayWeekendRule', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                        ${V.weekendRuleOptions.map(o => `<option value="${o.v}" ${o.v === V.formAutopayWeekendRule ? 'selected' : ''}>${o.l}</option>`).join('')}
                      </select>
                    </label>
                  </div>` : ''}` : ''}
              ${V.isLoanKind ? `
                <div style="height:1px;background:${TH.border};margin:4px 0"></div>
                <span style="font-size:12px;font-weight:600;color:${GREY};text-transform:uppercase;letter-spacing:0.06em">Loan schedule</span>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Pay from
                  <select data-change="${H(e => { set('loanFrom', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.loanFromOptions.map(o => `<option value="${o.v}" ${o.v === V.formLoanFrom ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Annual interest rate %
                    <input id="f-loan-rate" value="${esc(V.formLoanRate)}" placeholder="3,5" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                  </label>
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Remaining term (months)
                    <input id="f-loan-term" value="${esc(V.formLoanTermMonths)}" placeholder="84" inputmode="numeric" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
                  </label>
                </div>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Interest category
                  <select data-change="${H(e => { set('loanCategory', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.loanCategoryOptions.map(o => `<option value="${o.v}" ${o.v === V.formLoanCategory ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Day of the month
                    <select data-change="${H(e => { set('loanDay', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                      ${V.autopayDayOptions.map(o => `<option value="${o.v}" ${o.v === V.formLoanDay ? 'selected' : ''}>${o.l}</option>`).join('')}
                    </select>
                  </label>
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">If it lands on a weekend
                    <select data-change="${H(e => { set('loanWeekendRule', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                      ${V.weekendRuleOptions.map(o => `<option value="${o.v}" ${o.v === V.formLoanWeekendRule ? 'selected' : ''}>${o.l}</option>`).join('')}
                    </select>
                  </label>
                </div>` : ''}
              ${V.showIban ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">IBAN (optional)
                  <input id="f-iban" value="${esc(V.formIban)}" placeholder="NL91 ABNA 0417 1643 00" autocapitalize="characters" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
                </label>` : ''}
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
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

          ${V.isRecurringModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;gap:6px;border-bottom:1px solid ${TH.border}">
                ${V.recurTypeTabs.map(t => `
                  <button data-click="${H(() => { set('recurMovement', t.value); render(); })}" style="flex:1;border:0;border-bottom:2.5px solid ${t.underline};background:transparent;color:${t.color};font-weight:${t.weight};padding:10px 4px;cursor:pointer">${t.label}</button>`).join('')}
              </div>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Name
                <input id="f-name" value="${esc(V.formName)}" placeholder="e.g. Netflix, Car loan" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Amount
                <input id="f-amount" value="${esc(V.formAmount)}" placeholder="0,00" inputmode="decimal" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;font-variant-numeric:tabular-nums;outline:none">
              </label>
              ${!V.isRecurTransfer ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Category
                  <select data-change="${H(e => { set('category', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.recurCats.map(o => `<option value="${o.v}" ${o.v === V.formCategory ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Account
                <select data-change="${H(e => { set('account', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.accountOptions.map(o => `<option value="${o.v}" ${o.v === V.formAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              ${V.isRecurTransfer ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">To account
                  <select data-change="${H(e => { set('toAccount', +e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.toAccountOptions.map(o => `<option value="${o.v}" ${o.v === V.formToAccount ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Description (optional)
                <input id="f-note" value="${esc(V.formNote)}" placeholder="e.g. Family plan" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>

              <div style="height:1px;background:${TH.border};margin:4px 0"></div>
              <span style="font-size:12px;font-weight:600;color:${GREY};text-transform:uppercase;letter-spacing:0.06em">Schedule</span>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Frequency
                <select data-change="${H(e => { set('freq', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.freqOptions.map(o => `<option value="${o.v}" ${o.v === V.formFreq ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Every
                <select data-change="${H(e => { set('intervalN', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${Array.from({ length: 12 }, (_, i) => i + 1).map(n => `<option value="${n}" ${String(n) === V.formIntervalN ? 'selected' : ''}>${n} ${V.intervalUnit}</option>`).join('')}
                </select>
              </label>
              ${V.isFreqWeekly ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Day of the week
                  <select data-change="${H(e => { set('weekday', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.weekdayOptions.map(o => `<option value="${o.v}" ${String(o.v) === V.formWeekday ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              ${V.isFreqMonthly || V.isFreqYearly ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Day of the month
                  <select data-change="${H(e => { set('dayOfMonth', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${Array.from({ length: 31 }, (_, i) => i + 1).map(n => `<option value="${n}" ${String(n) === V.formDayOfMonth ? 'selected' : ''}>${n}</option>`).join('')}
                  </select>
                </label>` : ''}
              ${V.isFreqYearly ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Month
                  <select data-change="${H(e => { set('monthOfYear', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.monthOptions.map(o => `<option value="${o.v}" ${String(o.v) === V.formMonthOfYear ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              ${V.isFreqNthBiz ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Which business day
                  <select data-change="${H(e => { set('nthBusinessDay', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.nthBizOptions.map(o => `<option value="${o.v}" ${o.v === V.formNthBusinessDay ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              ${V.showWeekendRule ? `
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">If it lands on a weekend
                  <select data-change="${H(e => { set('weekendRule', e.target.value); render(); })}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                    ${V.weekendRuleOptions.map(o => `<option value="${o.v}" ${o.v === V.formWeekendRule ? 'selected' : ''}>${o.l}</option>`).join('')}
                  </select>
                </label>` : ''}
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Starts
                  <input type="date" data-change="${H(e => { set('startDate', e.target.value); render(); })}" value="${V.formStartDate}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none;color-scheme:${state.themeMode}">
                </label>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY};${V.formNoEnd ? 'opacity:0.5' : ''}">Ends
                  <input type="date" data-change="${H(e => { set('endDate', e.target.value); render(); })}" value="${V.formEndDate}" ${V.formNoEnd ? 'disabled' : ''} style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none;color-scheme:${state.themeMode}">
                </label>
              </div>
              <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
                <input type="checkbox" data-change="${H(e => { set('noEnd', e.target.checked); render(); })}" ${V.formNoEnd ? 'checked' : ''} style="width:17px;height:17px;cursor:pointer">
                <span style="font-size:13.5px">No end date</span>
              </label>
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
            </div>` : ''}

          ${V.isDeleteRecurringModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                <strong style="color:${TH.text}">${esc(V.deleteRecurringName)}</strong> has generated ${V.deleteRecurringTxCount} movement${V.deleteRecurringTxCount === 1 ? '' : 's'} so far. Pausing keeps everything and stops future charges from generating. Deleting removes the rule and unlinks its past movements — they stay in your ledger, but won't count as recurring anymore.
              </p>
              ${V.deleteRecurringPaused
                ? `<button data-click="${H(() => resumeRecurringAction())}" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Resume</button>`
                : `<button data-click="${H(() => pauseRecurringAction())}" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Pause — keep for later</button>`}
              <button data-click="${H(() => deleteRecurringAction())}" style="border:0;background:${TH.surface};color:${RED};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                <svg width="18" height="18"><use href="#ic-trash"></use></svg>Delete rule
              </button>
            </div>` : ''}

          ${V.isSettingsModal ? `
            ${themeSettingsHtml()}
            <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em;padding:2px 2px 0">Profile</span>
            <div style="display:flex;flex-direction:column;gap:2px;background:${TH.surface};border-radius:14px;overflow:hidden">
              <button data-click="${H(() => openModal('changePassword', null, { currentPassword: '', newPassword: '', confirmNewPassword: '' }))}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-gear"></use></svg>Change password
              </button>
              <button data-click="${H(() => logoutAction())}" style="border:0;background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-close"></use></svg>Log out
              </button>
            </div>
            <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em;padding:2px 2px 0">Data</span>
            <div style="display:flex;flex-direction:column;gap:2px;background:${TH.surface};border-radius:14px;overflow:hidden">
              <button data-click="${H(() => openModal('data'))}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-db"></use></svg>Data
              </button>
              <button data-click="${H(() => openModal('backups'))}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-refresh"></use></svg>Backups
              </button>
              <button data-click="${H(() => openAboutModal())}" style="border:0;background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-info"></use></svg>About
              </button>
            </div>
            <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em;padding:2px 2px 0">Bank import</span>
            <div style="background:${TH.surface};border-radius:14px;overflow:hidden">
              <button data-click="${H(() => openBankSetup())}" style="width:100%;border:0;background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${TH.text}">
                <svg width="20" height="20" style="color:${GREY}"><use href="#ic-bank"></use></svg>
                <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span>Bank import</span>
                  <span style="font-size:12px;color:${GREY};font-weight:400">${esc(V.bankStatusLabel)}</span>
                </span>
              </button>
            </div>
            <span style="font-size:12px;font-weight:600;color:${RED};text-transform:uppercase;letter-spacing:0.06em;padding:2px 2px 0">Danger zone</span>
            <div style="background:${TH.surface};border-radius:14px;overflow:hidden">
              <button data-click="${H(() => openModal('deleteAllData', null, { dangerPassword: '', dangerConfirm: '' }))}" style="border:0;background:transparent;text-align:left;padding:15px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;font-size:15px;color:${RED}">
                <svg width="20" height="20"><use href="#ic-trash"></use></svg>Delete all data
              </button>
            </div>` : ''}

          ${V.isChangePasswordModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Current password
                <input id="f-current-password" type="password" value="${esc(V.formCurrentPassword)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">New password
                <input id="f-new-password" type="password" value="${esc(V.formNewPassword)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Confirm new password
                <input id="f-confirm-new-password" type="password" value="${esc(V.formConfirmNewPassword)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
              <button data-click="${H(() => changePasswordAction())}" style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Save new password</button>
            </div>` : ''}

          ${V.isDeleteAllDataModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                This permanently deletes every account, category, movement, budget, and recurring rule. This cannot be undone. Your login password is not affected.
              </p>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Password
                <input id="f-danger-password" type="password" value="${esc(V.formDangerPassword)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Type DELETE to confirm
                <input id="f-danger-confirm" value="${esc(V.formDangerConfirm)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
              </label>
              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
              <button data-click="${H(() => deleteAllDataAction())}" style="border:0;background:${RED};color:#fff;border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Permanently delete everything</button>
            </div>` : ''}

          ${V.isDataModal ? `
            <div style="display:flex;flex-direction:column;gap:8px">
              <p style="margin:0;font-size:13.5px;color:${GREY};line-height:1.5">Download your full movement ledger as a spreadsheet-friendly CSV file — every expense, income, and transfer, with account and category names resolved.</p>
              <button data-click="${H(() => downloadTransactionsCsv())}" style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                <svg width="18" height="18"><use href="#ic-download"></use></svg>Download movements (.csv)
              </button>
            </div>` : ''}

          ${V.isBackupsModal ? `
            <div style="display:flex;flex-direction:column;gap:18px">
              <div style="display:flex;flex-direction:column;gap:8px">
                <span style="font-weight:700;font-size:15px">Export a backup</span>
                <p style="margin:0;font-size:13.5px;color:${GREY};line-height:1.5">Downloads everything — accounts, categories, movements, budgets, and recurring rules — as one JSON file. Keep it somewhere safe.</p>
                <button data-click="${H(() => downloadBackup())}" style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-download"></use></svg>Download backup (.json)
                </button>
              </div>
              <div style="height:1px;background:${TH.border}"></div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <span style="font-weight:700;font-size:15px;color:${RED}">Restore from a backup</span>
                <p style="margin:0;font-size:13.5px;color:${GREY};line-height:1.5">This replaces everything currently in the app with the contents of the backup file. This cannot be undone.</p>
                <input type="file" accept="application/json" id="f-backup-file" data-change="${H(e => pickBackupFile(e.target.files[0]))}" style="display:none">
                <label for="f-backup-file" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:12px;padding:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px">
                  <svg width="18" height="18"><use href="#ic-upload"></use></svg>${V.formBackupFileName ? 'Selected: ' + esc(V.formBackupFileName) : 'Choose backup file…'}
                </label>
                ${V.formBackupFileName ? `
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Password
                    <input id="f-backup-password" type="password" value="${esc(V.formBackupPassword)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
                  </label>
                  <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Type RESTORE to confirm
                    <input id="f-backup-confirm" value="${esc(V.formBackupConfirm)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:15px;outline:none">
                  </label>
                  ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}
                  <button data-click="${H(() => restoreBackupAction())}" style="border:0;background:${RED};color:#fff;border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Restore — replace everything</button>
                ` : ''}
              </div>
            </div>` : ''}

          ${V.isConnectBankModal ? `
            <div style="display:flex;flex-direction:column;gap:12px">
              <p style="margin:0;font-size:13.5px;color:${GREY};line-height:1.5">
                You will be sent to your bank to approve read-only access. Banks grant it for about 90 days, after which you reconnect here.
              </p>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:${GREY}">Country
                <select data-change="${H(V.onAspspCountry)}" style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};cursor:pointer;font-size:15px">
                  ${V.aspspCountryOptions.map(o => `<option value="${o[0]}" ${o[0] === V.aspspCountry ? 'selected' : ''}>${o[1]}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
                <input type="checkbox" data-change="${H(V.onAspspSandbox)}" ${V.aspspIncludeSandbox ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
                <span style="font-size:13px;color:${GREY}">Include sandbox banks (fake test banks, not real accounts)</span>
              </label>
              ${V.formError ? `<div style="font-size:13px;color:${RED}">${esc(V.formError)}</div>` : ''}
              ${V.aspspLoading
                ? `<div style="padding:20px;text-align:center;color:${GREY};font-size:13.5px">Loading banks…</div>`
                : V.aspspList.length
                  ? `<div style="display:flex;flex-direction:column;max-height:44vh;overflow:auto">
                      ${V.aspspList.map(b => `
                        <button data-click="${H(b.onClick)}" style="border:0;border-bottom:1px solid ${TH.border};background:transparent;text-align:left;padding:12px 4px;cursor:pointer;font-size:14.5px">${esc(b.name)}</button>`).join('')}
                    </div>`
                  : `<div style="padding:20px;text-align:center;color:${GREY};font-size:13.5px">No banks listed for this country.</div>`}
            </div>` : ''}

          ${V.isBankSetupModal ? `
            <div style="display:flex;flex-direction:column;gap:20px">
              ${V.bankEnvLocked ? `
                <div style="font-size:12.5px;color:${GREY};background:${TH.surface};border-radius:10px;padding:10px 12px;line-height:1.5">
                  Some of these values are pinned by an environment variable on the server and can't be changed here — each field below says so where it applies.
                </div>` : ''}

              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-weight:700;font-size:14.5px">1. Create an Enable Banking application</span>
                <p style="margin:0;font-size:13px;color:${GREY};line-height:1.55">
                  MerlitoMoney talks to your bank through <a href="https://enablebanking.com" target="_blank" rel="noopener noreferrer" style="color:${ACCENT}">enablebanking.com</a> — create a free account there and register an application. When it asks for an environment, choose <strong style="color:${TH.text}">restricted production</strong>: it's free for personal use and only ever links accounts you authorise yourself. <strong style="color:${TH.text}">Sandbox</strong> looks similar but only ever talks to fake test banks, never your real one.
                </p>
              </div>

              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-weight:700;font-size:14.5px">2. Register the redirect URL</span>
                <p style="margin:0;font-size:13px;color:${GREY};line-height:1.55">
                  On the application's page at Enable Banking, add the URL below as a redirect URL — it has to match <strong style="color:${TH.text}">character for character</strong>. A mismatch here isn't caught until your bank redirects back with an opaque error, so it's worth double-checking now rather than debugging it later.
                </p>
                <div style="display:flex;gap:8px;align-items:stretch">
                  <input readonly value="${esc(V.bankSuggestedRedirectUrl)}" data-click="${H(e => e.target.select())}" style="flex:1;min-width:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;border:1px solid ${TH.border};border-radius:10px;padding:10px 11px;background:${TH.surface};color:${TH.text}">
                  <button data-click="${H(() => copyRedirectUrl(V.bankSuggestedRedirectUrl))}" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:10px;padding:0 14px;cursor:pointer;font-weight:600;font-size:12.5px;white-space:nowrap;flex:none">Copy</button>
                </div>
                ${V.bankCopyFeedback ? `<span style="font-size:12px;color:${GREY}">${esc(V.bankCopyFeedback)}</span>` : ''}
                ${V.bankRedirectMismatch ? `
                  <div style="border:1px solid ${RED}55;background:${RED}0f;border-radius:10px;padding:10px 11px;display:flex;flex-direction:column;gap:4px">
                    <span style="font-size:12.5px;font-weight:600;color:${RED}">The redirect URL registered right now doesn't match this deployment</span>
                    <span style="font-size:12px;color:${GREY}">Currently registered: <code style="font-family:ui-monospace,Menlo,Consolas,monospace">${esc(V.bankConfiguredRedirectUrl)}</code></span>
                    <span style="font-size:12px;color:${GREY}">Expected by this deployment: <code style="font-family:ui-monospace,Menlo,Consolas,monospace">${esc(V.bankSuggestedRedirectUrl)}</code></span>
                    <span style="font-size:12px;color:${GREY}">Update it at Enable Banking to the expected value — otherwise connecting a bank fails at the very last step, with an opaque error there.</span>
                  </div>` : ''}
              </div>

              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-weight:700;font-size:14.5px">3. Paste the Application ID</span>
                ${V.bankAppIdLocked ? `
                  <p style="margin:0;font-size:13px;color:${GREY};line-height:1.5">Set on the server via the <code>ENABLEBANKING_APP_ID</code> environment variable — change it there, not here.</p>
                  <input value="${esc(V.bankConfigAppId)}" disabled style="border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface2};color:${GREY};font-size:14px">
                ` : `
                  <div style="display:flex;gap:8px">
                    <input id="f-bank-app-id" value="${esc(V.formBankAppId)}" placeholder="Application ID from Enable Banking" style="flex:1;min-width:0;border:1px solid ${TH.border};border-radius:12px;padding:12px 13px;background:${TH.surface};font-size:14.5px;outline:none">
                    <button data-click="${H(() => saveBankAppId())}" ${V.bankConfigBusy ? 'disabled' : ''} style="border:0;background:${TH.accentSoft};color:${ACCENT};border-radius:12px;padding:0 18px;cursor:pointer;font-weight:600;font-size:13.5px;flex:none">Save</button>
                  </div>
                  ${V.bankConfigAppId ? `<span style="font-size:12px;color:${GREY}">Currently saved: ${esc(V.bankConfigAppId)}</span>` : ''}
                `}
              </div>

              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-weight:700;font-size:14.5px">4. Upload the private key</span>
                ${V.bankKeyLocked ? `
                  <p style="margin:0;font-size:13px;color:${GREY};line-height:1.5">Set on the server via a key file — change it there, not here.</p>
                ` : `
                  <p style="margin:0;font-size:13px;color:${GREY};line-height:1.5">The private key (.pem) Enable Banking issued for this application. It's read in your browser and sent straight to the server — MerlitoMoney never shows it again, only its fingerprint below, to confirm which key is stored.</p>
                  <input type="file" accept=".pem,application/x-pem-file,text/plain" id="f-bank-key-file" data-change="${H(e => pickBankKeyFile(e.target.files[0]))}" style="display:none">
                  <label for="f-bank-key-file" style="border:1px solid ${TH.border};background:${TH.surface};color:${TH.text};border-radius:12px;padding:12px;cursor:pointer;font-weight:600;font-size:13.5px;display:flex;align-items:center;justify-content:center;gap:8px">
                    <svg width="17" height="17"><use href="#ic-upload"></use></svg>${V.formBankKeyFileName ? 'Selected: ' + esc(V.formBankKeyFileName) : 'Choose private key file (.pem)…'}
                  </label>
                `}
                ${V.bankKeyPresent ? `
                  <div style="font-size:12px;color:${GREY};display:flex;flex-direction:column;gap:2px">
                    <span>Key stored${V.bankKeyFingerprint ? ' · fingerprint ' + esc(V.bankKeyFingerprint) : ''}</span>
                    ${V.bankKeyUpdatedAt ? `<span>Last changed ${esc(V.bankKeyUpdatedAt)}</span>` : ''}
                  </div>` : ''}
                ${V.bankHasDbCreds ? `
                  <button data-click="${H(() => clearBankConfigAction())}" ${V.bankConfigBusy ? 'disabled' : ''} style="align-self:flex-start;border:0;background:transparent;color:${RED};cursor:pointer;font-weight:600;font-size:12.5px;padding:0">Clear stored credentials</button>` : ''}
              </div>

              ${V.formError ? `<span style="color:${RED};font-size:13px">${esc(V.formError)}</span>` : ''}

              <div style="height:1px;background:${TH.border}"></div>

              <div style="display:flex;flex-direction:column;gap:10px">
                <button data-click="${H(() => testBankConnectionAction())}" ${V.bankTestBusy ? 'disabled' : ''} style="border:0;background:${ACCENT};color:#fff;border-radius:12px;padding:13px;cursor:pointer;font-weight:600">${V.bankTestBusy ? 'Testing…' : 'Test connection'}</button>
                ${V.bankTest ? `
                  <div style="border:1px solid ${V.bankTest.ok ? GREEN : RED}55;background:${V.bankTest.ok ? GREEN : RED}0f;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px">
                    <span style="font-size:13.5px;font-weight:600;color:${V.bankTest.ok ? GREEN : RED}">${esc(V.bankTest.message || (V.bankTest.ok ? 'Success' : 'Failed'))}</span>
                    ${V.bankTest.ok && V.bankTest.countries && V.bankTest.countries.length ? `<span style="font-size:12px;color:${GREY}">${V.bankTest.bank_count} bank(s) across: ${esc(V.bankTest.countries.join(', '))}</span>` : ''}
                  </div>` : ''}
              </div>
            </div>` : ''}

          ${V.isDisconnectBankModal ? `
            <div style="display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.5">
                Disconnect <strong style="color:${TH.text}">${esc(V.disconnectBankName)}</strong>? MerlitoMoney stops fetching new transactions from it, but everything already imported and its account mapping stay exactly as they are. Reconnecting later means re-authorising at the bank from scratch.
              </p>
              <button data-click="${H(V.onDisconnectBank)}" style="border:0;background:${TH.surface};color:${RED};border-radius:12px;padding:13px;cursor:pointer;font-weight:600">Disconnect</button>
            </div>` : ''}

          ${V.isAboutModal ? `
            <div style="display:flex;flex-direction:column;gap:18px">
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0">
                <span style="width:56px;height:56px;border-radius:18px;background:#ffd43b;display:grid;place-items:center;overflow:hidden"><img src="cat-logo.png" alt="" style="width:74%;height:74%;object-fit:contain"></span>
                <span style="font-weight:700;font-size:17px">MerlitoMoney</span>
                <span style="font-size:13px;color:${GREY}">Version ${esc(V.appVersion)}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;background:${TH.surface};border-radius:14px;padding:14px 16px">
                <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em">Offline support</span>
                ${V.swInfo ? `
                  <span style="font-size:13.5px">${V.swInfo.registered
                    ? `Service worker active — ${esc(V.swInfo.state)}${V.swInfo.updateAvailable ? ' (update waiting — reload to apply)' : ''}`
                    : (V.swInfo.supported ? 'No service worker registered yet' : 'Not supported in this browser')}</span>
                ` : `<span style="font-size:13.5px;color:${GREY}">Checking…</span>`}
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-size:12px;font-weight:600;color:${TH.textFaint};text-transform:uppercase;letter-spacing:0.06em">Open source</span>
                <p style="margin:0;font-size:13px;color:${GREY};line-height:1.6">MerlitoMoney is a self-hosted, single-user budgeting app. It's built with FastAPI, Starlette, Uvicorn and Pydantic (Python) and vanilla JavaScript with no frontend build step — all MIT/BSD-licensed open source. No analytics, no external services, no accounts beyond your own.</p>
              </div>
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
