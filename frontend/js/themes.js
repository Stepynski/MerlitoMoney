export const THEME_STYLES = [
  { key: 'colorful', label: 'Colorful' },
  { key: 'professional', label: 'Professional' },
  { key: 'kakeibo', label: 'Kakeibo' },
  { key: 'mono', label: 'Mono' }
];
export const THEMES = {
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
