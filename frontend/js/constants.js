export const RED = '#d93a34', GREEN = '#2f9e44';
export const APP_VERSION = '2.0.0';
export const PAL = ['#1f6fd0', '#e03b34', '#4caf50', '#f4703a', '#12897f', '#f2a25c', '#7048c8', '#b6d334', '#5b46b8', '#26aee8', '#ef5b8c', '#e8a33d', '#a531b5', '#c0173f', '#8b6ce0'];
export const ICONS = [
  'ic-cart', 'ic-fork', 'ic-car', 'ic-bag', 'ic-health', 'ic-home', 'ic-play', 'ic-dots', 'ic-salary', 'ic-refresh', 'ic-gift', 'ic-star', 'ic-bank', 'ic-wallet', 'ic-cash', 'ic-piggy', 'ic-transfer', 'ic-receipt',
  'ic-plane', 'ic-train', 'ic-bus', 'ic-taxi', 'ic-fuel', 'ic-parking', 'ic-bike',
  'ic-bulb', 'ic-water', 'ic-wifi', 'ic-phone', 'ic-tools', 'ic-sofa',
  'ic-coffee', 'ic-beer', 'ic-pizza',
  'ic-baby', 'ic-paw', 'ic-book', 'ic-graduation', 'ic-scissors', 'ic-shirt',
  'ic-music', 'ic-camera', 'ic-game', 'ic-ticket',
  'ic-dumbbell', 'ic-pill', 'ic-tooth',
  'ic-invoice', 'ic-chart', 'ic-percent', 'ic-shield', 'ic-briefcase', 'ic-card'
];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Labels for the country codes /api/bank/aspsps can return (Enable Banking
// covers the EEA + UK + CH). Only used to make the connect-bank country
// picker readable — an unrecognised code still works, it just falls back to
// showing the bare ISO code as its own label.
export const COUNTRY_NAMES = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus', CZ: 'Czechia',
  DK: 'Denmark', EE: 'Estonia', FI: 'Finland', FR: 'France', DE: 'Germany', GR: 'Greece',
  HU: 'Hungary', IS: 'Iceland', IE: 'Ireland', IT: 'Italy', LV: 'Latvia', LI: 'Liechtenstein',
  LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden',
  GB: 'United Kingdom', CH: 'Switzerland'
};
// Shown only when the ASPSP list can't be fetched yet (nothing configured,
// or the credentials don't work) so the country picker is never empty.
export const FALLBACK_COUNTRIES = [['NL', 'Netherlands'], ['IT', 'Italy'], ['DE', 'Germany'], ['BE', 'Belgium'], ['FR', 'France'], ['ES', 'Spain']];

// today's date as YYYY-MM-DD in the browser's own timezone. Date.toISOString()
// is UTC, so anything entered between midnight and 1-2am local (UTC+1/+2) would
// otherwise be stamped with yesterday's date.
export function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
