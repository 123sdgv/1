// 通用部件：h()、线条图标、页面栈、页、底部面板、菜单、对话框、轻提示、表单行、头像、选图

// 浏览器原生的 append(null) 会插进一个 "null" 文字。这里让它跳过 null / false，写条件部件时省心
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const fn of ['append', 'prepend', 'before', 'after', 'replaceWith']) {
    const orig = proto[fn];
    if (orig) proto[fn] = function (...xs) { return orig.apply(this, xs.filter((x) => x != null && x !== false)); };
  }
}
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) el.append(k);
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ── 线条图标 ──
const P = {
  back: '<path d="M14.6 5.4 8 12l6.6 6.6"/>',
  chev: '<path d="m9.4 5.6 6.4 6.4-6.4 6.4"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  plusc: '<circle cx="12" cy="12" r="8.6"/><path d="M12 8v8M8 12h8"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  send: '<path d="M4.6 11.6 19.4 5l-6.2 14.4-2.4-6.2z"/><path d="m10.8 13.2 3.4-3.4"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="9.6" r="1.7"/><path d="m4 17 4.6-4.4 3.2 3 3.4-3.6 4.8 5"/>',
  camera: '<path d="M4 8.6a2 2 0 0 1 2-2h2l1.4-2h5.2l1.4 2h2a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.6" r="3.4"/>',
  pay: '<path d="M6.5 9.4h11.6l-3.2-3.2M17.5 14.6H5.9l3.2 3.2"/>',
  heart: '<path d="M12 19.2S4.4 14.6 4.4 9.2A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7.6 1.6c0 5.4-7.6 10-7.6 10z"/>',
  heartf: '<path d="M12 19.2S4.4 14.6 4.4 9.2A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7.6 1.6c0 5.4-7.6 10-7.6 10z" fill="currentColor"/>',
  comment: '<path d="M4.5 7a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6.2a3 3 0 0 1-3 3H11l-4.2 3.6v-3.6H7.5a3 3 0 0 1-3-3z"/>',
  msg: '<path d="M4.5 6.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H11l-4.2 3.6v-3.6H7.5a3 3 0 0 1-3-3z"/><path d="M8.6 9.6h6.8M8.6 12.4h4.2"/>',
  star: '<path d="m12 4.4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 16.1l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6z"/>',
  user: '<circle cx="12" cy="8.8" r="3.6"/><path d="M5 19.6a7 7 0 0 1 14 0"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.4 19a5.6 5.6 0 0 1 11.2 0"/><path d="M15.4 6.2a3 3 0 0 1 0 5.6M17.2 14.2a5.4 5.4 0 0 1 3.4 4.8"/>',
  edit: '<path d="M5 19l1-4.2 9.6-9.6a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L9.2 18z"/><path d="M14 6.8l3.2 3.2"/>',
  trash: '<path d="M4.6 7.4h14.8M9.4 7.4V5h5.2v2.4M6.6 7.4l.9 11.4a1.6 1.6 0 0 0 1.6 1.4h5.8a1.6 1.6 0 0 0 1.6-1.4l.9-11.4"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
  redo: '<path d="M18.6 8.4A7.4 7.4 0 1 0 19.4 13"/><path d="M19.4 4.4v4.2h-4.2"/>',
  door: '<path d="M6 20V5.4A1.4 1.4 0 0 1 7.4 4h7.2A1.4 1.4 0 0 1 16 5.4V20M4 20h16"/><circle cx="13.2" cy="12.4" r=".9" fill="currentColor" stroke="none"/>',
  book: '<path d="M5 5.4A1.4 1.4 0 0 1 6.4 4H18v14H6.6A1.6 1.6 0 0 0 5 19.6z"/><path d="M5 19.6A1.6 1.6 0 0 0 6.6 21H18v-3"/>',
  note: '<path d="M6.5 3.5h8.2l3.8 3.8v12.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M8.6 11.2h7M8.6 14.4h7M8.6 17.6h4.2"/>',
  cal: '<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4"/><path d="M3.8 9.6h16.4M8.2 3.2v3.6M15.8 3.2v3.6"/>',
  pin: '<path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 12v8"/>',
  lock: '<rect x="5.6" y="10.4" width="12.8" height="9.6" rx="2"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  swap: '<path d="M6 8h11l-3-3M18 16H7l3 3"/>',
  globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.4 2.4 3.4 5.2 3.4 8.4s-1 6-3.4 8.4c-2.4-2.4-3.4-5.2-3.4-8.4s1-6 3.4-8.4z"/>',
  mask: '<path d="M4 6.4c5.2-1.6 10.8-1.6 16 0 0 6.4-3 11.6-8 12.8-5-1.2-8-6.4-8-12.8z"/><path d="M8 10.4c.9-.5 1.9-.5 2.8 0M13.2 10.4c.9-.5 1.9-.5 2.8 0M9.4 14.6c1.6 1 3.6 1 5.2 0"/>',
  palette: '<path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.4 0 1.8-1 1.4-2-.6-1.4.2-2.6 1.6-2.6h1.6a3.6 3.6 0 0 0 3.6-3.6c0-4.5-3.7-8.2-8.2-8.2z"/><circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="8.4" r="1.1" fill="currentColor" stroke="none"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><path d="m4 17 4.6-4.4 3.2 3 3.4-3.6 4.8 5"/>',
  search: '<circle cx="10.6" cy="10.6" r="5.8"/><path d="m15 15 4.6 4.6"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.4v2M12 18.6v2M3.4 12h2M18.6 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M5.9 18.1l1.4-1.4M16.7 7.3l1.4-1.4"/>',
  loc: '<path d="M12 20.4s-6-5.8-6-10.6a6 6 0 0 1 12 0c0 4.8-6 10.6-6 10.6z"/><circle cx="12" cy="9.8" r="2.2"/>',
  down: '<path d="M12 4.6v11M7.4 11l4.6 4.6 4.6-4.6M5 19.4h14"/>',
  up: '<path d="M12 15.6v-11M7.4 9.2 12 4.6l4.6 4.6M5 19.4h14"/>',
  check: '<path d="m5.4 12.4 4.2 4.2 9-9"/>',
  key: '<circle cx="8.4" cy="15.6" r="3.6"/><path d="m11 13 7.6-7.6M16 8l2.4 2.4M14 10l1.6 1.6"/>',
  bell: '<path d="M6.4 16.4V11a5.6 5.6 0 0 1 11.2 0v5.4l1.4 1.6H5z"/><path d="M10 20.2a2.2 2.2 0 0 0 4 0"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 10.8v5.4"/><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none"/>',
  wand: '<path d="m5 19 9.4-9.4M14.4 9.6l1.8-1.8 1.4 1.4-1.8 1.8z"/><path d="M17 3.8v2M18 4.8h-2M20.2 8v1.6M21 8.8h-1.6"/>',
  left: '<path d="M14.6 6.4 9 12l5.6 5.6"/>',
  voice: '<path d="M8 9.4a4 4 0 0 1 0 5.2M11.2 7a7.4 7.4 0 0 1 0 10M14.6 4.8a10.6 10.6 0 0 1 0 14.4"/>',
  mic: '<rect x="9" y="3.6" width="6" height="10.4" rx="3"/><path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0M12 17.6v2.8"/>',
  smile: '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 14.2c1.8 2 5 2 6.8 0"/><circle cx="9.2" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="12" cy="12" r="8.4"/>',
  ringck: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="m8 12.2 2.8 2.8L16.2 9.6" stroke="#fff" stroke-width="1.9"/>',
  right: '<path d="M9.4 6.4 15 12l-5.6 5.6"/>',
  quote: '<path d="M5.7 14.4c0-3.4 1.7-5.7 4.7-7"/><circle cx="7.9" cy="14.6" r="2.3" fill="currentColor" stroke="none"/><path d="M13.9 14.4c0-3.4 1.7-5.7 4.7-7"/><circle cx="16.1" cy="14.6" r="2.3" fill="currentColor" stroke="none"/>',
  multi: '<path d="m4.2 7.2 1.7 1.7 3-3M4.2 15.6l1.7 1.7 3-3"/><path d="M12 7.6h7.6M12 16h7.6"/>',
  fwd: '<path d="M13.6 5.4 19.4 11l-5.8 5.6"/><path d="M19.2 11h-7.2a7 7 0 0 0-7 7v.8"/>',
  reply: '<path d="M10.4 5.4 4.8 11l5.6 5.6"/><path d="M5 11h8.2a6 6 0 0 1 6 6v1"/>',
  undo: '<path d="M8.6 5 4.6 9l4 4"/><path d="M4.8 9h9.6a5 5 0 0 1 0 10H9"/>',
  inbox: '<path d="M4 13.4 6.6 5.8A1.6 1.6 0 0 1 8.1 4.8h7.8a1.6 1.6 0 0 1 1.5 1l2.6 7.6v4.6a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18z"/><path d="M4 13.4h4.6l1.4 2.4h4l1.4-2.4H20"/>',
  mail: '<rect x="3.6" y="5.6" width="16.8" height="12.8" rx="2.2"/><path d="m4.4 7 7.6 6 7.6-6"/>',
  pin: '<path d="M8.6 4.4h6.8M10.2 4.4v5.4l-3 3.6h9.6l-3-3.6V4.4M12 13.4v6.2"/>',
  unpin: '<path d="M8.6 4.4h6.8M10.2 4.4v5.4l-3 3.6h9.6l-3-3.6V4.4M12 13.4v6.2"/><path d="m4.6 4.6 14.8 14.8"/>',
  compose: '<path d="M11 5H6.6A1.6 1.6 0 0 0 5 6.6v10.8A1.6 1.6 0 0 0 6.6 19h10.8a1.6 1.6 0 0 0 1.6-1.6V13"/><path d="M10 14l.6-2.8 6.6-6.6a1.4 1.4 0 0 1 2 2l-6.6 6.6z"/>',
  toc: '<path d="M9 7h10.4M9 12h10.4M9 17h10.4"/><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"/>',
  fileIn: '<path d="M7 3.8h7l4 4v11.4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1z"/><path d="M13.6 4v4.2h4.2"/><path d="M12 10.6v6.2M9.4 14.2 12 16.8l2.6-2.6"/>',
  aa: '<path d="M3.6 18.4 8.4 5.8l4.8 12.6M5.4 14h6"/><circle cx="17.6" cy="15.7" r="2.7"/><path d="M20.3 12.2v6.2"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
export const ic = (name, cls) => h('span', { class: 'ico', html: icon(name, cls) });
export const btnIc = (name, onclick, label = '', cls = '') => h('button', { class: 'ibtn ' + cls, 'aria-label': label, html: icon(name), onclick });

// ── 头像：有图用图，没图用名字第一个字 ──
export function avatar(src, name = '', cls = '') {
  const el = h('span', { class: 'av ' + cls });
  if (src) el.append(h('img', { src, alt: '' }));
  else el.append(h('b', { text: [...(name || '·').trim()][0] || '·' }));
  return el;
}

// ── 页面栈：一个 App 一个。右边滑进来，左边缘往右拖返回 ──
const EASE = 'cubic-bezier(.2,.85,.25,1)';
const UNDER = -26;
export class Stack {
  constructor(host, onEmpty) {
    this.host = host; this.pages = []; this.busy = false; this.onEmpty = onEmpty;
    this.wireEdge();
  }
  get top() { return this.pages[this.pages.length - 1]; }
  root(pg) { this.pages = [pg]; this.host.append(pg.el); pg.onShow && pg.onShow(); }
  push(pg) {
    if (this.busy) return;
    const under = this.top;
    const shade = h('div', { class: 'shade' });
    pg.shade = shade;
    this.host.append(shade, pg.el);
    this.pages.push(pg);
    this.busy = true;
    const dur = 340;
    pg.el.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE }).onfinish = () => { this.busy = false; pg.onShow && pg.onShow(); };
    under.el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: dur, easing: EASE });
    under.el.style.transform = `translate3d(${UNDER}%,0,0)`;
    under.onHide && under.onHide();
    shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASE });
  }
  pop(fromPx = 0) {
    if (this.pages.length < 2) { this.onEmpty && this.onEmpty(); return; }
    if (this.busy) return;
    const pg = this.pages.pop(), under = this.top;
    const W = this.host.clientWidth || 1, p = fromPx / W, dur = Math.max(160, 300 * (1 - p));
    this.busy = true;
    pg.el.animate([{ transform: `translate3d(${fromPx}px,0,0)` }, { transform: 'translate3d(100%,0,0)' }], { duration: dur, easing: EASE, fill: 'forwards' }).onfinish = () => { pg.el.remove(); pg.shade.remove(); this.busy = false; pg.onDestroy && pg.onDestroy(); };
    under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE });
    under.el.style.transform = '';
    pg.shade.animate([{ opacity: 1 - p }, { opacity: 0 }], { duration: dur, easing: EASE, fill: 'forwards' });
    under.onShow && under.onShow();
  }
  /** 关掉整个 App 前把所有页的清理都跑一遍 */
  destroyAll() { for (const pg of this.pages) pg.onDestroy && pg.onDestroy(); this.pages = []; }
  wireEdge() {
    const host = this.host;
    let id = null, x0 = 0, y0 = 0, dx = 0, live = false, lastX = 0, lastT = 0, vx = 0;
    host.addEventListener('pointerdown', (e) => {
      if (this.busy || this.pages.length < 2 || e.clientX - host.getBoundingClientRect().left > 22) return;
      id = e.pointerId; x0 = lastX = e.clientX; y0 = e.clientY; dx = 0; lastT = performance.now(); live = false; vx = 0;
    }, true);
    host.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!live) {
        if (Math.abs(my) > 12 && Math.abs(my) > mx) { id = null; return; }
        if (mx < 10) return;
        live = true;
        try { host.setPointerCapture(id); } catch {}
      }
      e.preventDefault();
      const W = host.clientWidth;
      dx = Math.max(0, Math.min(W, mx));
      const t = performance.now();
      vx = (e.clientX - lastX) / Math.max(1, t - lastT); lastX = e.clientX; lastT = t;
      const pg = this.top, under = this.pages[this.pages.length - 2];
      pg.el.style.transform = `translate3d(${dx}px,0,0)`;
      under.el.style.transform = `translate3d(${UNDER * (1 - dx / W)}%,0,0)`;
      pg.shade.style.opacity = 1 - dx / W;
    }, true);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!live) return;
      live = false;
      const W = host.clientWidth, go = dx > W * 0.32 || (vx > 0.45 && dx > 30);
      const pg = this.top, under = this.pages[this.pages.length - 2];
      if (go) { pg.el.style.transform = ''; pg.shade.style.opacity = ''; this.pop(dx); }
      else {
        const p = dx / W;
        pg.el.animate([{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 220, easing: EASE });
        under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: 220, easing: EASE });
        pg.el.style.transform = ''; under.el.style.transform = `translate3d(${UNDER}%,0,0)`; pg.shade.style.opacity = '';
      }
    };
    host.addEventListener('pointerup', end, true);
    host.addEventListener('pointercancel', end, true);
  }
}

/** 一页：标题栏 + 滚动区。back=false 时左上角是关闭 App */
export function page({ title = '', left = null, right = null, cls = '', onBack, big = false }) {
  const scroll = h('div', { class: 'scroll' });
  const ttl = h('b', { class: 'ttl', text: title });
  const head = h('header', { class: 'bar' + (big ? ' big' : '') },
    h('div', { class: 'lt' }, left !== null ? left : h('button', { class: 'bk', 'aria-label': '返回', html: icon('back'), onclick: () => onBack && onBack() })),
    ttl,
    h('div', { class: 'rt' }, right));
  const el = h('section', { class: 'pg ' + cls }, head, scroll);
  if (big) {
    scroll.prepend(h('h1', { class: 'bigttl', text: title }));
    scroll.addEventListener('scroll', () => head.classList.toggle('solid', scroll.scrollTop > 34), { passive: true });
  }
  return { el, head, scroll, setTitle: (t) => { ttl.textContent = t; const b = scroll.querySelector('.bigttl'); if (b) b.textContent = t; } };
}

// ── 底部面板 ──
export function sheet({ title = '', body, cls = '', onClose, foot = null, full = false }) {
  const host = document.getElementById('sheets');
  const back = h('div', { class: 'backdrop' });
  const grab = h('div', { class: 'grab' }, h('i'));
  const close = () => {
    if (wrap.closing) return;
    wrap.closing = true;
    wrap.classList.remove('on');
    setTimeout(() => wrap.remove(), 360);
    onClose && onClose();
  };
  const head = h('div', { class: 'sh-head' }, h('b', { text: title }), h('button', { class: 'sh-x', 'aria-label': '关闭', html: icon('close'), onclick: close }));
  const bodyEl = h('div', { class: 'sh-body' }, body);
  const box = h('div', { class: 'sheet ' + cls + (full ? ' full' : '') }, grab, title ? head : null, bodyEl, foot);
  const wrap = h('div', { class: 'sheet-wrap' }, back, box);
  host.append(wrap);
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
  back.addEventListener('click', close);
  let id = null, y0 = 0, dy = 0;
  for (const el of [grab, head]) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; id = e.pointerId; y0 = e.clientY; dy = 0; el.setPointerCapture(id); box.style.transition = 'none'; });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); box.style.transform = `translate3d(0,${dy}px,0)`; });
    const end = (e) => { if (e.pointerId !== id) return; id = null; box.style.transition = ''; if (dy > 90) close(); else box.style.transform = ''; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  return { close, box, body: bodyEl };
}

/** 动作菜单：[[文字, 回调, 'danger'?], ...] */
export function menu(items, title = '') {
  const host = document.getElementById('sheets');
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 300); };
  const wrap = h('div', { class: 'menu-wrap' },
    h('div', { class: 'backdrop', onclick: close }),
    h('div', { class: 'menu' },
      h('div', { class: 'menu-g' }, title ? h('div', { class: 'menu-t', text: title }) : null,
        items.filter(Boolean).map(([label, fn, cls]) => h('button', { class: cls || '', text: label, onclick: () => { close(); fn && fn(); } }))),
      h('div', { class: 'menu-g' }, h('button', { class: 'cancel', text: '取消', onclick: close }))));
  host.append(wrap);
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
}

/** 居中小对话框，返回按下的按钮的值 */
export function dialog({ title, text, buttons = [['好', true, 'main']], input = null }) {
  return new Promise((res) => {
    const host = document.getElementById('sheets');
    let field = null;
    if (input) field = h(input.multi ? 'textarea' : 'input', { class: 'dlg-in', value: input.value || '', placeholder: input.placeholder || '', type: input.type || 'text', rows: input.multi ? 4 : null, inputmode: input.inputmode || null });
    const done = (v) => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); res(input ? (v ? field.value : null) : v); };
    const wrap = h('div', { class: 'dlg-wrap' },
      h('div', { class: 'dlg' },
        title ? h('b', { text: title }) : null,
        text ? h('p', { text }) : null,
        field,
        h('div', { class: 'dlg-btns' }, buttons.map(([label, v, cls]) => h('button', { class: cls || '', text: label, onclick: () => done(v) })))));
    host.append(wrap);
    wrap.getBoundingClientRect();
    wrap.classList.add('on');
    if (field) setTimeout(() => field.focus(), 60);
  });
}
export const confirm = (title, text, ok = '确定', danger = false) => dialog({ title, text, buttons: [['取消', false], [ok, true, danger ? 'danger' : 'main']] });
export const ask = (title, value = '', placeholder = '', multi = false) => dialog({ title, input: { value, placeholder, multi }, buttons: [['取消', false], ['好', true, 'main']] });

/** 小提示。action = [文字, 回调]：后面带一个能点的按钮（比如「撤销」） */
export function toast(text, ms = 2000, action = null) {
  const host = document.getElementById('toasts');
  const t = h('div', { class: 'toast' + (action ? ' act' : ''), text });
  if (action) t.append(h('button', { text: action[0], onclick: () => { t.remove(); action[1](); } }));
  host.append(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, ms);
}

// ── 长按：手指不动按住 ms 毫秒触发；动了就算滑动 ──
export function longPress(el, fn, ms = 480) {
  let t = 0, x = 0, y = 0, fired = false;
  el.addEventListener('pointerdown', (e) => { fired = false; x = e.clientX; y = e.clientY; clearTimeout(t); t = setTimeout(() => { fired = true; navigator.vibrate?.(8); fn(e); }, ms); });
  el.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - x, e.clientY - y) > 8) clearTimeout(t); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => clearTimeout(t));
  el.addEventListener('click', (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ── 长按冒出来的黑色小条：只有图标。items = [[图标, 回调, 读屏用的名字], ...]
// 默认出在 anchor 上面；上面放不下就放下面；anchor 太高（长文）就跟着手指的位置
export function popbar(anchor, items, point = null) {
  const host = document.getElementById('sheets');
  const dev = document.getElementById('device').getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  let wrap = null;
  const close = () => { if (!wrap) return; const w = wrap; wrap = null; w.classList.remove('on'); anchor.classList.remove('pressed'); setTimeout(() => w.remove(), 160); };
  const bar = h('div', { class: 'popbar' }, items.filter(Boolean).map(([ic, fn, label]) =>
    h('button', { 'aria-label': label, html: icon(ic), onclick: (e) => { e.stopPropagation(); close(); fn(); } })));
  const arrow = h('i', { class: 'pop-arr' });
  bar.append(arrow);
  const back = h('div', { class: 'pop-back' });
  back.addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
  wrap = h('div', { class: 'pop-wrap' }, back, bar);
  host.append(wrap);
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const hb = anchor.closest('.pg')?.querySelector(':scope > .bar')?.getBoundingClientRect();
  const minTop = (hb ? hb.bottom - dev.top : 64) + 6;
  const maxTop = dev.height - bh - 70;
  const ax = (r.width < dev.width * 0.9 ? r.left + r.width / 2 : point?.x ?? r.left + r.width / 2) - dev.left;
  let top = r.top - dev.top - bh - 10, mode = 'above';
  if (top < minTop) {
    if (r.bottom - dev.top + 10 <= maxTop) { top = r.bottom - dev.top + 10; mode = 'below'; }
    else { top = Math.max(minTop, Math.min(maxTop, (point ? point.y - dev.top : minTop + bh) - bh - 18)); mode = 'point'; }
  }
  const left = Math.max(10, Math.min(dev.width - bw - 10, ax - bw / 2));
  Object.assign(bar.style, { left: left + 'px', top: top + 'px' });
  arrow.style.left = Math.max(14, Math.min(bw - 14, ax - left)) + 'px';
  bar.classList.toggle('below', mode === 'below');
  arrow.hidden = mode === 'point';
  anchor.classList.add('pressed');
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
  return { close };
}

// ── 左滑露出红色删除：滑开不删，点红色那块才删。一次只开一行，点别处收回 ──
let swOpen = null;
document.addEventListener('pointerdown', (e) => { if (swOpen && !swOpen.wrap.contains(e.target)) swOpen.close(); }, true);
// 默认是红色删除；opt = { label, icon, cls } 可以换成别的（比如消息列表的蓝色置顶）
export function swipeRow(front, onTap, opt = {}) {
  if (typeof opt === 'string') opt = { label: opt };
  const { label = '删除', icon: ic = 'trash', cls = '' } = opt;
  const W = 76;
  const del = h('button', { class: 'sw-del ' + cls, 'aria-label': label, html: icon(ic), onclick: (e) => { e.stopPropagation(); close(); onTap(); } });
  front.classList.add('sw-front');
  const wrap = h('div', { class: 'sw-wrap' }, del, front);
  let id = null, x0 = 0, y0 = 0, base = 0, cur = 0, live = false, moved = false;
  const set = (x, anim) => { cur = x; front.style.transition = anim ? 'transform .26s var(--ez)' : 'none'; front.style.transform = x ? `translate3d(${x}px,0,0)` : ''; del.style.opacity = x ? 1 : 0; };
  const me = { wrap, close: () => close() };
  function close() { set(0, true); if (swOpen === me) swOpen = null; }
  front.addEventListener('pointerdown', (e) => { id = e.pointerId; x0 = e.clientX; y0 = e.clientY; base = cur; live = false; moved = false; });
  front.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!live) {
      if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { id = null; return; }
      if (Math.abs(mx) < 8) return;
      live = moved = true;
      try { front.setPointerCapture(id); } catch {}
    }
    set(Math.max(-W * 1.25, Math.min(0, base + mx)));
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!live) return;
    live = false;
    if (cur < -W / 2) { set(-W, true); swOpen = me; } else close();
  };
  front.addEventListener('pointerup', end);
  front.addEventListener('pointercancel', end);
  front.addEventListener('click', (e) => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; return; }
    if (cur) { e.stopPropagation(); e.preventDefault(); close(); }
  }, true);
  set(0);
  return wrap;
}

// ── 表单：分组列表 ──
export const group = (title, ...rows) => h('div', { class: 'grp' }, title ? h('div', { class: 'grp-t', text: title }) : null, h('div', { class: 'grp-b' }, rows));
export const note = (text) => h('p', { class: 'grp-note', text });
export function row({ label, value = '', icon: icn = null, onclick = null, chev = !!onclick, cls = '', right = null }) {
  return h(onclick ? 'button' : 'div', { class: 'row ' + cls, onclick },
    icn ? ic(icn) : null,
    h('span', { class: 'row-l', text: label }),
    right || h('span', { class: 'row-v', text: value }),
    chev ? ic('chev', 'chev') : null);
}
export function inputRow({ label, value = '', placeholder = '', type = 'text', onchange, inputmode = null }) {
  const inp = h('input', { class: 'row-in', value, placeholder, type, inputmode, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  inp.addEventListener('change', () => onchange && onchange(inp.value));
  return h('label', { class: 'row' }, h('span', { class: 'row-l', text: label }), inp);
}
export function areaRow({ value = '', placeholder = '', onchange, rows = 4 }) {
  const ta = h('textarea', { class: 'row-ta', placeholder, rows });
  ta.value = value;
  ta.addEventListener('change', () => onchange && onchange(ta.value));
  autosize(ta);
  return h('div', { class: 'row tall' }, ta);
}
export function toggleRow({ label, value, onchange, sub = '' }) {
  const sw = h('input', { type: 'checkbox', class: 'sw' });
  sw.checked = !!value;
  sw.addEventListener('change', () => onchange && onchange(sw.checked));
  return h('label', { class: 'row' }, h('span', { class: 'row-l' }, label, sub ? h('small', { text: sub }) : null), sw);
}
export function stepRow({ label, value, min, max, step = 1, unit = '', onchange }) {
  let v = value;
  const out = h('b', { text: v + unit });
  const set = (n) => { v = Math.max(min, Math.min(max, Math.round(n * 100) / 100)); out.textContent = v + unit; onchange && onchange(v); };
  return h('div', { class: 'row' }, h('span', { class: 'row-l', text: label }),
    h('div', { class: 'step' }, h('button', { text: '−', onclick: () => set(v - step) }), out, h('button', { text: '+', onclick: () => set(v + step) })));
}

/** 滑条：名字和数值在上，滑条在下 */
export function slideRow({ label, value, min, max, step = 1, fmt = (v) => String(v), onchange }) {
  const out = h('b', { text: fmt(value) });
  const r = h('input', { type: 'range', class: 'slide', min, max, step, value });
  const paint = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
  r.addEventListener('input', () => { out.textContent = fmt(+r.value); paint(); onchange && onchange(+r.value); });
  paint();
  return h('div', { class: 'row slide-row' }, h('div', { class: 'slide-top' }, h('span', { class: 'row-l', text: label }), out), r);
}
/** 开关 + 打开了才展开的几行（关掉就收起来） */
export function foldRow({ label, value, onchange, kids = [] }) {
  const sw = h('input', { type: 'checkbox', class: 'sw' });
  sw.checked = !!value;
  const fold = h('div', { class: 'fold' + (value ? ' open' : '') }, h('div', { class: 'fold-in' }, kids));
  sw.addEventListener('change', () => { fold.classList.toggle('open', sw.checked); onchange && onchange(sw.checked); });
  return h('div', { class: 'frow' }, h('label', { class: 'row' }, h('span', { class: 'row-l', text: label }), sw), kids.length ? fold : null);
}

export function autosize(ta, max = 9999) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

// ── 选图：返回压缩后的 dataURL ──
export function pickImage({ max = 512, quality = 0.86, square = false } = {}) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    document.body.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return res(null);
      try { res(await shrink(f, max, quality, square)); } catch { toast('这张图读不出来'); res(null); }
    });
    inp.click();
  });
}
export async function shrink(file, max, quality, square) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const cv = h('canvas', { width: Math.round(sw * k), height: Math.round(sh * k) });
  cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(url);
  return cv.toDataURL('image/jpeg', quality);
}

/** 多行文字 → 段落（保留换行） */
export const paras = (s, cls = 'p') => String(s || '').split(/\n{2,}/).map((p) => h('p', { class: cls }, ...p.split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line]))));

export function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
