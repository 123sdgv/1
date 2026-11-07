// 主屏幕的 App 图标：白底（白到浅灰的渐变），黑色画，带一点立体感。都是原创的 120×120 SVG。
const INK = '#1d1d1f';
const bg = (id) => `<defs><linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ECEDF0"/></linearGradient><filter id="sh-${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.4" stdDeviation="2.4" flood-color="#000" flood-opacity=".2"/></filter></defs><rect width="120" height="120" fill="url(#bg-${id})"/>`;
const svg = (id, body) => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${bg(id)}${body}</svg>`;

function gear(cx, cy, R, r, teeth) {
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, w = (Math.PI * 2) / teeth;
    const pts = [[a0 - w * 0.2, r], [a0 - w * 0.14, R], [a0 + w * 0.14, R], [a0 + w * 0.2, r], [a0 + w * 0.5, r]];
    pts.forEach(([a, rad], j) => { d += (i === 0 && j === 0 ? 'M' : 'L') + (cx + Math.cos(a) * rad).toFixed(2) + ' ' + (cy + Math.sin(a) * rad).toFixed(2); });
  }
  return d + 'Z';
}

export const ICONS = {
  social: () => svg('social', `
    <path d="M28 27h44a11 11 0 0 1 11 11v21a11 11 0 0 1-11 11H49l-13 10V70h-8a11 11 0 0 1-11-11V38a11 11 0 0 1 11-11z" fill="#fff" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"/>
    <g filter="url(#sh-social)">
      <path d="M54 50h38a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-4v11l-14-11H54a10 10 0 0 1-10-10V60a10 10 0 0 1 10-10z" fill="${INK}"/>
    </g>
    <path d="M54 52h38a8 8 0 0 1 8 8" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/>
    <circle cx="61" cy="70" r="3.6" fill="#fff"/><circle cx="73" cy="70" r="3.6" fill="#fff"/><circle cx="85" cy="70" r="3.6" fill="#fff"/>`),

  offline: () => svg('offline', `
    <defs><linearGradient id="lt-offline" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4d5d9"/><stop offset="1" stop-color="#d4d5d9" stop-opacity="0"/></linearGradient>
    <linearGradient id="rm-offline" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f3f3f4"/></linearGradient></defs>
    <path d="M47 92h38l20 18H55z" fill="url(#lt-offline)"/>
    <rect x="45" y="20" width="42" height="72" rx="2.5" fill="url(#rm-offline)" stroke="${INK}" stroke-width="4.6"/>
    <path d="M58 92V58M74 92V58" stroke="#e6e6e9" stroke-width="1.6"/>
    <g filter="url(#sh-offline)"><path d="M45 21 27 30v72l18-9z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></g>
    <path d="M30 34l12-6" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/>
    <circle cx="40" cy="62" r="2.6" fill="#fff"/>
    <path d="M18 104h84" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>`),

  diary: () => svg('diary', `
    <path d="M86 26h4a3 3 0 0 1 3 3v66a3 3 0 0 1-3 3h-4z" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <path d="M89 32v60" stroke="#c9cacf" stroke-width="1.4"/>
    <g filter="url(#sh-diary)"><rect x="28" y="22" width="60" height="78" rx="6" fill="${INK}"/></g>
    <rect x="28" y="22" width="11" height="78" rx="5" fill="#000" fill-opacity=".35"/>
    <rect x="44" y="30" width="38" height="62" rx="3" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.6"/>
    <path d="M56 51.5c0-3.4 2.8-6 6-4.4 3.2-1.6 6 1 6 4.4 0 4.4-6 8.2-6 8.2s-6-3.8-6-8.2z" fill="#fff" fill-opacity=".9"/>
    <path d="M78 52h16a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H78z" fill="${INK}" stroke="#fff" stroke-opacity=".25" stroke-width="1.4"/>
    <circle cx="91" cy="60" r="3.4" fill="#fff"/>
    <path d="M70 100v14l5-4 5 4v-14z" fill="#8e8f94"/>`),

  memo: () => svg('memo', `
    <g filter="url(#sh-memo)"><rect x="28" y="24" width="64" height="78" rx="7" fill="#fff" stroke="${INK}" stroke-width="4.6"/></g>
    <path d="M28 40V31a7 7 0 0 1 7-7h50a7 7 0 0 1 7 7v9z" fill="${INK}"/>
    <g fill="#fff"><circle cx="42" cy="32" r="2.6"/><circle cx="54" cy="32" r="2.6"/><circle cx="66" cy="32" r="2.6"/><circle cx="78" cy="32" r="2.6"/></g>
    <g stroke="#d3d4d8" stroke-width="2.2" stroke-linecap="round"><path d="M50 56h30M50 69h30M50 82h18"/></g>
    <g fill="${INK}"><circle cx="40" cy="56" r="3"/><circle cx="40" cy="69" r="3"/><circle cx="40" cy="82" r="3"/></g>
    <path d="M74 98l18-30 6 3.5-17.5 30z" fill="${INK}"/><path d="M74 98l1-7 5.5 3.3z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`),

  calendar: () => {
    const d = new Date();
    const wk = '日一二三四五六'[d.getDay()];
    return svg('calendar', `
      <text x="60" y="38" text-anchor="middle" font-family="-apple-system,'PingFang SC','Helvetica Neue',sans-serif" font-size="15" font-weight="600" fill="#8a8b90" letter-spacing="1">星期${wk}</text>
      <text x="60" y="92" text-anchor="middle" font-family="-apple-system,'SF Pro Display','Helvetica Neue',sans-serif" font-size="56" font-weight="300" fill="${INK}" letter-spacing="-2">${d.getDate()}</text>`);
  },

  album: () => svg('album', `
    <defs><linearGradient id="ph-album" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d5e63"/><stop offset="1" stop-color="#232326"/></linearGradient></defs>
    <g transform="rotate(-9 60 64)"><rect x="30" y="26" width="56" height="66" rx="3" fill="#fff" stroke="#bfc0c5" stroke-width="2"/><rect x="36" y="32" width="44" height="42" fill="#d6d7db"/></g>
    <g transform="rotate(7 60 64)" filter="url(#sh-album)"><rect x="34" y="30" width="56" height="66" rx="3" fill="#fff" stroke="${INK}" stroke-width="3.4"/>
      <rect x="40" y="36" width="44" height="42" fill="url(#ph-album)"/>
      <circle cx="73" cy="47" r="4.6" fill="#fff" fill-opacity=".9"/>
      <path d="M40 78l12-14 9 9 7-6 16 11z" fill="#fff" fill-opacity=".75"/></g>`),

  weather: () => svg('weather', `
    <g filter="url(#sh-weather)"><circle cx="48" cy="48" r="17" fill="${INK}"/></g>
    <g stroke="${INK}" stroke-width="4.4" stroke-linecap="round"><path d="M48 18v6M48 72v6M18 48h6M24.8 24.8l4.2 4.2M71.2 24.8 67 29M24.8 71.2 29 67"/></g>
    <g filter="url(#sh-weather)"><path d="M46 96h40a15 15 0 0 0 1.4-29.9A21 21 0 0 0 47 71.6 12.3 12.3 0 0 0 46 96z" fill="#fff" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"/></g>
    <path d="M54 76a14 14 0 0 1 12-6" fill="none" stroke="#c9cacf" stroke-width="2.4" stroke-linecap="round"/>`),

  settings: () => svg('settings', `
    <defs><radialGradient id="gr-settings" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#3a3b3f"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>
    <g filter="url(#sh-settings)"><path d="${gear(60, 60, 38, 30, 10)}" fill="url(#gr-settings)"/></g>
    <circle cx="60" cy="60" r="19" fill="#fff"/>
    <circle cx="60" cy="60" r="19" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>
    <circle cx="60" cy="60" r="8" fill="${INK}"/>
    <path d="M38 40a30 30 0 0 1 14-10" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2.4" stroke-linecap="round"/>`),
};

export const appIcon = (id) => (ICONS[id] ? ICONS[id]() : '');
