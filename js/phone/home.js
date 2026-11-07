// 主屏幕：4 列格子，App 占 1 格，小组件占 2×2 / 4×2 / 4×4。底下 Dock 放 4 个 App。
// 长按进入整理：拖动换位置（App 能在格子和 Dock 之间拖），小组件可以换大小、删掉、加新的。
import { h, $, $$, sheet, menu, avatar } from '../core/ui.js';
import * as D from '../core/data.js';
import { APPS, appById } from './apps.js';
import { appIcon } from './icons.js';
import { WIDGETS } from './widgets.js';
import { openApp } from './window.js';

const SIZES = { s: [2, 2], m: [4, 2], l: [4, 4] };
const SIZE_NAME = { s: '小', m: '中', l: '大' };

function defaultLayout() {
  return {
    grid: ['w:a', 'w:b', 'app:offline', 'app:diary', 'app:memo', 'app:weather', 'w:c'],
    dock: ['app:social', 'app:album', 'app:calendar', 'app:settings'],
    widgets: { 'w:a': { type: 'clock', size: 'm' }, 'w:b': { type: 'weather', size: 's' }, 'w:c': { type: 'chat', size: 'm' } },
  };
}
function fixLayout(l) {
  l ||= defaultLayout();
  // 去重 + 补上新加的 App（自动放进格子末尾）
  const seen = new Set();
  l.dock = l.dock.filter((k) => !seen.has(k) && seen.add(k) && k.startsWith('app:') && appById(k.slice(4))).slice(0, 4);
  l.grid = l.grid.filter((k) => !seen.has(k) && seen.add(k) && (k.startsWith('w:') ? l.widgets[k] && WIDGETS[l.widgets[k].type] : appById(k.slice(4))));
  for (const a of APPS) if (!seen.has('app:' + a.id)) l.grid.push('app:' + a.id);
  return l;
}
// 默认布局里 Dock 和格子不重复：Dock 放社交、相册、日历、设置，格子里就不放它们
const L = () => {
  let l = D.layout();
  if (!l) {
    l = defaultLayout();
    l.grid = l.grid.filter((k) => !l.dock.includes(k));
  }
  return fixLayout(l);
};

let layout, editing = false, gridEl, dockEl, refreshT = 0;

export function buildHome() {
  layout = L();
  const home = $('#home');
  home.innerHTML = '';
  gridEl = h('div', { id: 'grid' });
  dockEl = h('div', { id: 'dock' });
  const top = h('div', { class: 'home-top' },
    h('button', { class: 'home-add', text: '＋', 'aria-label': '加小组件', onclick: addWidget }),
    h('button', { class: 'home-done', text: '完成', onclick: () => setEdit(false) }));
  home.append(top, h('div', { class: 'home-scroll' }, gridEl), dockEl);
  home.addEventListener('click', (e) => { if (editing && (e.target === home || e.target === gridEl || e.target.classList.contains('home-scroll'))) setEdit(false); });
  render();
  for (const ev of ['msgs', 'meta', 'chars', 'weather', 'events', 'photos', 'account']) D.on(ev, () => { clearTimeout(refreshT); refreshT = setTimeout(refreshWidgets, 200); });
  setInterval(refreshWidgets, 20000);
  D.on('meta', refreshBadges);
  D.on('chars', refreshBadges);
  D.on('account', refreshBadges);
}

function save() { D.setLayout(layout); }

function itemEl(key) {
  if (key.startsWith('app:')) {
    const a = appById(key.slice(4));
    const el = h('button', { class: 'app', 'data-key': key, 'data-app': a.id, 'aria-label': a.name },
      h('span', { class: 'app-ic', html: appIcon(a.id) }),
      h('span', { class: 'app-nm', text: a.name }));
    return el;
  }
  const w = layout.widgets[key], def = WIDGETS[w.type];
  const [cw, ch] = SIZES[w.size] || SIZES.s;
  const el = h('div', { class: `wg wg-${w.type} sz-${w.size}`, 'data-key': key, style: { gridColumn: `span ${cw}`, gridRow: `span ${ch}` } },
    h('div', { class: 'wg-in' }),
    h('button', { class: 'wg-del', 'aria-label': '删掉', text: '−' }),
    h('button', { class: 'wg-size', text: SIZE_NAME[w.size] }));
  def.render(el.firstChild, w.size, w.conf || {});
  return el;
}

function render() {
  const rects = snapshot();
  gridEl.innerHTML = '';
  dockEl.innerHTML = '';
  for (const k of layout.grid) gridEl.append(itemEl(k));
  for (const k of layout.dock) dockEl.append(itemEl(k));
  for (const el of $$('[data-key]', $('#home'))) wireItem(el);
  refreshBadges();
  flip(rects);
}
function refreshWidgets() {
  if (!gridEl || dragging) return;
  for (const el of $$('.wg', gridEl)) {
    const w = layout.widgets[el.dataset.key];
    if (!w) continue;
    const inner = el.querySelector('.wg-in');
    inner.innerHTML = '';
    WIDGETS[w.type].render(inner, w.size, w.conf || {});
  }
  // 日历图标的日期也会变
  for (const el of $$('[data-app="calendar"] .app-ic', $('#home'))) el.innerHTML = appIcon('calendar');
}
export function refreshBadges() {
  const n = D.chars().reduce((s, c) => s + (D.meta(c.id).unread || 0), 0);
  for (const el of $$('[data-app="social"]', $('#home'))) {
    el.querySelector('.badge')?.remove();
    if (n) el.append(h('i', { class: 'badge', text: n > 99 ? '99+' : n }));
  }
}

// ── FLIP：重排时从旧位置滑到新位置 ──
function snapshot() {
  const m = new Map();
  for (const el of $$('[data-key]', $('#home'))) m.set(el.dataset.key, el.getBoundingClientRect());
  return m;
}
function flip(before) {
  for (const el of $$('[data-key]', $('#home'))) {
    const a = before.get(el.dataset.key);
    if (!a || el.classList.contains('lift')) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.85,.25,1)' });
  }
}

function setEdit(on) {
  editing = on;
  $('#home').classList.toggle('editing', on);
  if (!on) save();
}

// ── 点、长按、拖 ──
let dragging = null;
function wireItem(el) {
  const key = el.dataset.key;
  let pid = null, x0 = 0, y0 = 0, t = 0, moved = false, long = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wg-del,.wg-size')) return;
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; moved = false; long = false;
    clearTimeout(t);
    t = setTimeout(() => { long = true; if (!editing) { setEdit(true); navigator.vibrate?.(10); } startDrag(el, e); }, editing ? 160 : 450);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    if (dragging) return;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 9) {
      moved = true;
      clearTimeout(t);
      if (editing) { long = true; startDrag(el, e); }
    }
  });
  const up = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    clearTimeout(t);
    if (dragging) return;
    if (moved || long) return;
    if (editing) { if (key.startsWith('w:')) widgetConf(key); return; }
    // 日程小组件上的小圆圈：打勾，不打开 App
    const ck = e.target.closest?.('[data-ck]');
    if (ck) { const [id, date] = ck.dataset.ck.split('|'); D.toggleDone(id, date); navigator.vibrate?.(6); return; }
    if (key.startsWith('app:')) openApp(key.slice(4));
    else { const w = layout.widgets[key], to = WIDGETS[w.type].open; if (to) openApp(to); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { pid = null; clearTimeout(t); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.querySelector('.wg-del')?.addEventListener('click', (e) => {
    e.stopPropagation();
    layout.grid = layout.grid.filter((k) => k !== key);
    delete layout.widgets[key];
    render(); save();
  });
  el.querySelector('.wg-size')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const w = layout.widgets[key], sizes = WIDGETS[w.type].sizes;
    w.size = sizes[(sizes.indexOf(w.size) + 1) % sizes.length];
    render(); save();
  });
}

function startDrag(el, e) {
  const key = el.dataset.key;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.append(ghost);
  el.classList.add('lift');
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  dragging = { key, ghost };
  let lastSwap = 0;
  const move = (ev) => {
    ghost.style.left = ev.clientX - ox + 'px';
    ghost.style.top = ev.clientY - oy + 'px';
    if (performance.now() - lastSwap < 180) return;
    ghost.style.display = 'none';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    ghost.style.display = '';
    const target = under?.closest('[data-key]');
    const inDock = !!under?.closest('#dock');
    if (target && target.dataset.key !== key) { if (moveTo(key, target.dataset.key, inDock)) lastSwap = performance.now(); }
    else if (!target && inDock && key.startsWith('app:') && !layout.dock.includes(key) && layout.dock.length < 4) { remove(key); layout.dock.push(key); render(); lastSwap = performance.now(); }
    else if (!target && under?.closest('#grid,.home-scroll') && layout.dock.includes(key)) { remove(key); layout.grid.push(key); render(); lastSwap = performance.now(); }
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    const now = $(`#home [data-key="${CSS.escape(key)}"]`);
    if (now) {
      const b = now.getBoundingClientRect(), g = ghost.getBoundingClientRect();
      ghost.animate([{ left: g.left + 'px', top: g.top + 'px' }, { left: b.left + 'px', top: b.top + 'px' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { ghost.remove(); now.classList.remove('lift'); };
    } else ghost.remove();
    dragging = null;
    save();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
function remove(key) { layout.grid = layout.grid.filter((k) => k !== key); layout.dock = layout.dock.filter((k) => k !== key); }
function moveTo(key, targetKey, inDock) {
  const fromDock = layout.dock.includes(key), toDock = layout.dock.includes(targetKey);
  if (toDock && key.startsWith('w:')) return false;
  if (toDock && !fromDock && layout.dock.length >= 4) {
    // Dock 满了：和那个图标对换
    const i = layout.dock.indexOf(targetKey), j = layout.grid.indexOf(key);
    layout.dock[i] = key; layout.grid[j] = targetKey;
  } else {
    const arrFrom = fromDock ? layout.dock : layout.grid;
    const arrTo = toDock ? layout.dock : layout.grid;
    const from = arrFrom.indexOf(key), to = arrTo.indexOf(targetKey);
    arrFrom.splice(from, 1);
    const idx = arrTo.indexOf(targetKey);
    arrTo.splice(arrFrom === arrTo && from <= to ? idx + 1 : idx, 0, key);
  }
  render();
  $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('lift');
  return true;
}

// ── 加小组件、小组件设置 ──
function addWidget() {
  const body = h('div', { class: 'wg-pick' });
  const s = sheet({ title: '加小组件', body });
  for (const [type, def] of Object.entries(WIDGETS)) {
    const prev = h('div', { class: `wg wg-${type} sz-s preview` }, h('div', { class: 'wg-in' }));
    def.render(prev.firstChild, 's', {});
    body.append(h('button', { class: 'wg-pick-it', onclick: () => {
      const key = 'w:' + D.uid();
      layout.widgets[key] = { type, size: def.sizes.includes('m') ? 'm' : def.sizes[0] };
      layout.grid.unshift(key);
      s.close(); render(); save();
    } }, prev, h('span', { text: def.name })));
  }
}
function widgetConf(key) {
  const w = layout.widgets[key], def = WIDGETS[w.type];
  const items = def.sizes.map((sz) => [`${SIZE_NAME[sz]}${w.size === sz ? '（现在）' : ''}`, () => { w.size = sz; render(); save(); }]);
  if (def.conf === 'char') {
    items.push(['显示所有人的最新消息' + (!w.conf?.char ? '（现在）' : ''), () => { w.conf = {}; render(); save(); }]);
    for (const c of D.chars()) items.push([`只看 ${D.nameOf(c)}` + (w.conf?.char === c.id ? '（现在）' : ''), () => { w.conf = { char: c.id }; render(); save(); }]);
  }
  menu(items, def.name);
}
