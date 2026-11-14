// 主屏幕：可以有好几页，左右滑着翻。每页 4 列格子，东西按格子坐标放（中间可以空着）。App 占 1 格，小组件占 w×h 格。
// 底下 Dock 放 4 个 App（每页都一样）。
// 长按进入整理：
//   拖到哪就放在哪（落点上有东西就让到最近的空位；拖到同一页的 App 上 = 跟它换位置）；拖到屏幕左右边上停一下翻页（最后一页的右边会多出一页）。
//   小组件右下角（靠右边的小组件是左下角）有个小角，拖着改大小，松手对齐格子；左上角 − 删掉；点一下 = 它的设置（只看谁 / 放图 / 倒数哪件事）。
//   左上角 ＋ 加小组件、加新的一页。整理完，空着的页自己收掉。
import { h, $, $$, sheet, menu, icon, shrink, toast } from '../core/ui.js';
import * as D from '../core/data.js';
import { APPS, appById } from './apps.js';
import { appIcon } from './icons.js';
import { WIDGETS, sizeClass, nearestSize } from './widgets.js';
import { openApp } from './window.js';

const COLS = 4, GAP_X = 14, GAP_Y = 12, PAD_X = 20, PAD_T = 4, PAGE_T = 34, PAD_B = 24;
const LEGACY = { s: [2, 2], m: [4, 2], l: [4, 4] };
const MAX_PICS = 9;

// 布局：{ pages: [[{ k, x, y }…], …], dock: [key…], widgets: { 'w:xx': { type, w, h, conf } } }
// key 是 app:<id> / w:<id>。老存档：页里是一串 key（按顺序挤着排）、小组件存的是 size（s/m/l），读的时候换算成坐标
function defaultLayout() {
  return {
    pages: [['w:a', 'w:b', 'app:offline', 'app:diary', 'app:memo', 'app:weather', 'w:c']],
    dock: ['app:social', 'app:album', 'app:calendar', 'app:settings'],
    widgets: { 'w:a': { type: 'clock', w: 4, h: 2 }, 'w:b': { type: 'weather', w: 2, h: 2 }, 'w:c': { type: 'chat', w: 4, h: 2 } },
  };
}

// ── 格子的算术 ──
const dimsIn = (L, k) => (k.startsWith('w:') ? [L.widgets[k]?.w || 2, L.widgets[k]?.h || 2] : [1, 1]);
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxOf = (L, it) => { const [w, h] = dimsIn(L, it.k); return { x: it.x, y: it.y, w, h }; };
function fits(L, items, x, y, w, h, skip = null) {
  if (x < 0 || y < 0 || x + w > COLS) return false;
  const r = { x, y, w, h };
  return !items.some((it) => it.k !== skip && overlap(boxOf(L, it), r));
}
const bottomOf = (L, items) => items.reduce((m, it) => Math.max(m, it.y + dimsIn(L, it.k)[1]), 0);
/** 从上往下、从左往右第一个放得下的地方 */
function firstFree(L, items, w, h, maxY = Infinity) {
  for (let y = 0; y + h <= maxY && y < 500; y++) for (let x = 0; x + w <= COLS; x++) if (fits(L, items, x, y, w, h)) return { x, y };
  return null;
}
/** 离 (ox, oy) 最近的空位；尽量在这一页看得见的范围里 */
function nearestFree(L, items, ox, oy, w, h) {
  let best = null, bs = Infinity;
  const lim = Math.max(rows, bottomOf(L, items)) + h + 1;
  for (let y = 0; y < lim; y++) for (let x = 0; x + w <= COLS; x++) {
    if (!fits(L, items, x, y, w, h)) continue;
    const s = Math.abs(x - ox) + Math.abs(y - oy) * 1.3 + (y + h > rows ? 40 + y : 0);
    if (s < bs) { bs = s; best = { x, y }; }
  }
  return best || { x: 0, y: lim };
}
/**
 * 把 key 放到 (x, y)：压到的东西让到最近的空位（prefer 有的话，第一个先试那里 = 换位置）。
 * 让出去的东西要是被挤到这一页看不见的地方了，就别挤它：key 自己落在离 (x, y) 最近的空位（resize 时不这样，keep = true）
 */
function arrange(L, items, key, x, y, prefer = null, keep = false) {
  const [w, h] = dimsIn(L, key);
  x = Math.max(0, Math.min(COLS - w, x)); y = Math.max(0, y);
  const R = { x, y, w, h }, out = [], hit = [];
  for (const it of items) { if (it.k === key) continue; (overlap(boxOf(L, it), R) ? hit : out).push(it); }
  const rest = [...out];
  out.push({ k: key, x, y });
  hit.sort((a, b) => a.y - b.y || a.x - b.x);
  let pushedOut = false;
  for (const it of hit) {
    const [iw, ih] = dimsIn(L, it.k);
    let spot = null;
    if (prefer && fits(L, out, prefer.x, prefer.y, iw, ih)) { spot = prefer; prefer = null; }
    spot ||= nearestFree(L, out, it.x, it.y, iw, ih);
    if (spot.y + ih > rows && it.y + ih <= rows) pushedOut = true;
    out.push({ k: it.k, ...spot });
  }
  if (pushedOut && !keep) {
    const s2 = nearestFree(L, [...rest, ...hit], x, y, w, h);
    if (s2.y + h <= rows) return [...rest, ...hit, { k: key, ...s2 }];
  }
  return out;
}
/** 读进来的一页：坐标不对、叠在一起的挪开 */
function tidy(L, items) {
  const out = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const [w, h] = dimsIn(L, it.k);
    const x = Math.max(0, Math.min(COLS - w, it.x | 0)), y = Math.max(0, it.y | 0);
    out.push({ k: it.k, ...(fits(L, out, x, y, w, h) ? { x, y } : nearestFree(L, out, x, y, w, h)) });
  }
  return out;
}
/** 新东西（新的 App、新加的小组件）放哪：从第 from 页开始，第一页放得下的地方；都满了就加一页。返回页码 */
function placeNew(L, key, from = 0) {
  const [w, h] = dimsIn(L, key);
  for (let p = Math.max(0, from); p < L.pages.length; p++) {
    const s = firstFree(L, L.pages[p], w, h, rows);
    if (s) { L.pages[p].push({ k: key, ...s }); return p; }
  }
  L.pages.push([{ k: key, x: 0, y: 0 }]);
  return L.pages.length - 1;
}

function fixLayout(l) {
  l ||= defaultLayout();
  l.widgets ||= {};
  for (const [k, w] of Object.entries(l.widgets)) {
    if (!WIDGETS[w.type]) { delete l.widgets[k]; continue; }
    if (!(w.w && w.h)) { [w.w, w.h] = LEGACY[w.size] || LEGACY.s; delete w.size; }
    [w.w, w.h] = nearestSize(w.type, w.w, w.h);
    // 相册小组件：以前只能放一张（conf.file），现在是好几张（conf.files）
    if (w.conf?.file && !w.conf.files) w.conf = { ...w.conf, files: [w.conf.file] };
    if (w.conf) delete w.conf.file;
  }
  if (!Array.isArray(l.pages)) l.pages = [Array.isArray(l.grid) ? l.grid : []];
  delete l.grid;
  const seen = new Set();
  const ok = (k) => typeof k === 'string' && !seen.has(k) && (k.startsWith('w:') ? !!l.widgets[k] : k.startsWith('app:') && !!appById(k.slice(4)));
  l.dock = (l.dock || []).filter((k) => ok(k) && k.startsWith('app:') && seen.add(k)).slice(0, 4);
  l.pages = l.pages.filter(Array.isArray).map((pg) => {
    const placed = [], loose = [];
    for (const it of pg) {
      const k = typeof it === 'string' ? it : it?.k;
      if (!ok(k)) continue;
      seen.add(k);
      if (typeof it === 'string' || !Number.isFinite(it.x) || !Number.isFinite(it.y)) loose.push(k); else placed.push({ k, x: it.x, y: it.y });
    }
    const items = tidy(l, placed);
    // 老存档：按原来的顺序一个个挤着放（跟以前看起来一样）
    for (const k of loose) { const [w, h] = dimsIn(l, k); items.push({ k, ...firstFree(l, items, w, h) }); }
    return items;
  });
  if (!l.pages.length) l.pages = [[]];
  // 没在任何地方的小组件（存档坏了）就不要了；新加的 App 放进最后一页（满了往后加一页）
  for (const k of Object.keys(l.widgets)) if (!seen.has(k)) delete l.widgets[k];
  for (const a of APPS) if (!seen.has('app:' + a.id)) placeNew(l, 'app:' + a.id, l.pages.length - 1);
  return l;
}
const L0 = () => fixLayout(structuredClone(D.layout()));

let layout, editing = false, pagesEl, stripEl, dotsEl, dockEl, refreshT = 0, page = 0, swipedAt = 0;
let rows = 6, rowH = 90; // 一页看得见几行、一行多高（measure 算）
const pageArr = () => layout.pages[page];

export function buildHome() {
  const home = $('#home');
  home.innerHTML = '';
  stripEl = h('div', { class: 'home-strip' });
  pagesEl = h('div', { class: 'home-pages' }, stripEl);
  dotsEl = h('div', { class: 'home-dots' });
  dockEl = h('div', { id: 'dock' });
  const top = h('div', { class: 'home-top' },
    h('button', { class: 'home-add', text: '＋', 'aria-label': '添加', onclick: addSheet }),
    h('button', { class: 'home-done', text: '完成', onclick: () => setEdit(false) }));
  home.append(top, pagesEl, dotsEl, dockEl);
  // 先量一下一页放得下几行，再读布局（新 App 往哪放要用到）
  stripEl.append(h('div', { class: 'home-page' }, h('div', { class: 'grid' })));
  measure();
  layout = L0();
  home.addEventListener('click', (e) => {
    if (!editing || Date.now() - swipedAt < 350) return;
    if (e.target === home || e.target.matches?.('.grid, .home-page, .home-pages, .home-strip, .home-dots')) setEdit(false);
  });
  wireSwipe();
  render();
  goPage(0, false);
  if (window.ResizeObserver) new ResizeObserver(() => measure()).observe(pagesEl);
  for (const ev of ['msgs', 'meta', 'chars', 'weather', 'events', 'photos', 'account']) D.on(ev, () => { clearTimeout(refreshT); refreshT = setTimeout(refreshWidgets, 200); });
  D.on('mails', refreshBadges);
  setInterval(refreshWidgets, 20000);
  D.on('meta', refreshBadges);
  D.on('chars', refreshBadges);
  D.on('account', refreshBadges);
  // 从 App 回到主屏幕：小组件刷新一下（相册换图、倒数日过了一天）
  document.addEventListener('app-closed', () => setTimeout(refreshWidgets, 60));
}

/** 一页看得见几行（手机高矮不一样）。格子的行高跟 CSS 里的 --rowh 一样算 */
function measure() {
  const pg = stripEl?.querySelector('.home-page');
  if (!pg) return;
  const W = pg.clientWidth, H = pg.clientHeight;
  if (!W || !H) return;
  rowH = (W - 82) / 4 + 8;
  rows = Math.max(3, Math.floor((H - PAGE_T - PAD_T - PAD_B + GAP_Y) / (rowH + GAP_Y)));
  $('#home').style.setProperty('--rows', rows);
}
/** 某一页上，屏幕坐标 (left, top) 落在第几列第几行 */
function cellAt(p, left, top) {
  const grid = stripEl.children[p]?.querySelector('.grid');
  if (!grid) return { x: 0, y: 0 };
  const r = grid.getBoundingClientRect();
  const colW = (r.width - PAD_X * 2 - GAP_X * (COLS - 1)) / COLS;
  return { x: Math.round((left - r.left - PAD_X) / (colW + GAP_X)), y: Math.round((top - r.top - PAD_T) / (rowH + GAP_Y)) };
}

// ── 翻页 ──
function goPage(i, anim = true) {
  page = Math.max(0, Math.min(layout.pages.length - 1, i));
  stripEl.style.transition = anim ? 'transform .34s cubic-bezier(.2,.85,.25,1)' : 'none';
  stripEl.style.transform = `translate3d(${-page * 100}%,0,0)`;
  drawDots();
}
function drawDots() {
  dotsEl.innerHTML = '';
  dotsEl.classList.toggle('one', layout.pages.length < 2);
  layout.pages.forEach((_, i) => dotsEl.append(h('i', { class: i === page ? 'on' : '' })));
}
// 手指左右滑翻页。整理模式下在图标上滑是拖图标，所以那时要在空白处滑（或者把图标拖到屏幕边上）
function wireSwipe() {
  // 听整个主屏幕（页面、小圆点、Dock 上滑都算），顶上「＋」「完成」那两个按钮除外
  const host = $('#home');
  let sw = null;
  host.addEventListener('pointerdown', (e) => { sw = dragging || e.target.closest?.('.home-top') ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, live: false, t: performance.now() }; });
  host.addEventListener('pointermove', (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    if (dragging) { sw = null; return; }
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { sw = null; return; }
      if (Math.abs(dx) < 12) return;
      if (layout.pages.length < 2) { sw = null; return; }
      sw.live = true;
      try { host.setPointerCapture(sw.id); } catch {}
    }
    e.preventDefault();
    sw.dx = dx;
    const edge = (page === 0 && dx > 0) || (page === layout.pages.length - 1 && dx < 0);
    stripEl.style.transition = 'none';
    stripEl.style.transform = `translate3d(calc(${-page * 100}% + ${edge ? dx / 3 : dx}px),0,0)`;
  });
  const end = (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const s0 = sw; sw = null;
    if (!s0.live) return;
    swipedAt = Date.now();
    const W = pagesEl.clientWidth || 1, v = s0.dx / Math.max(1, performance.now() - s0.t);
    if (s0.dx < -W * 0.22 || (v < -0.35 && s0.dx < -24)) goPage(page + 1);
    else if (s0.dx > W * 0.22 || (v > 0.35 && s0.dx > 24)) goPage(page - 1);
    else goPage(page);
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}

function save() { D.setLayout(layout); }

function itemEl(key, pos) {
  const place = (el, w, hh) => { if (pos) { el.style.gridColumn = `${pos.x + 1} / span ${w}`; el.style.gridRow = `${pos.y + 1} / span ${hh}`; } return el; };
  if (key.startsWith('app:')) {
    const a = appById(key.slice(4));
    return place(h('button', { class: 'app', 'data-key': key, 'data-app': a.id, 'aria-label': a.name },
      h('span', { class: 'app-ic', html: appIcon(a.id) }),
      h('span', { class: 'app-nm', text: a.name })), 1, 1);
  }
  const w = layout.widgets[key], def = WIDGETS[w.type];
  // 改大小的小角：靠右边的小组件放在左下角（往左拉变宽），别的在右下角
  const leftHandle = pos && pos.x > 0 && pos.x + w.w === COLS;
  const el = place(h('div', { class: `wg wg-${w.type} sz-${sizeClass(w.w, w.h)}`, 'data-key': key },
    h('div', { class: 'wg-in' }),
    h('button', { class: 'wg-del', 'aria-label': '删掉', text: '−' }),
    def.sizes.length > 1 ? h('span', { class: 'wg-rs' + (leftHandle ? ' l' : ''), 'aria-label': '改大小' }) : null), w.w, w.h);
  def.render(el.firstChild, sizeClass(w.w, w.h), w.conf || {}, key);
  return el;
}

function render() {
  const rects = snapshot();
  const tops = $$('.home-page', stripEl).map((x) => x.scrollTop);
  stripEl.innerHTML = '';
  dockEl.innerHTML = '';
  layout.pages.forEach((items, i) => {
    const grid = h('div', { class: 'grid' }, items.map((it) => itemEl(it.k, it)));
    const pg = h('div', { class: 'home-page', 'data-page': i }, grid);
    stripEl.append(pg);
    if (tops[i]) pg.scrollTop = tops[i];
  });
  for (const k of layout.dock) dockEl.append(itemEl(k, null));
  for (const el of $$('[data-key]', $('#home'))) wireItem(el);
  if (page > layout.pages.length - 1) goPage(layout.pages.length - 1, false); else drawDots();
  refreshBadges();
  flip(rects);
}
function refreshWidgets() {
  if (!stripEl || dragging) return;
  for (const el of $$('.wg', stripEl)) {
    const w = layout.widgets[el.dataset.key];
    if (!w) continue;
    const inner = el.querySelector('.wg-in');
    inner.innerHTML = '';
    WIDGETS[w.type].render(inner, sizeClass(w.w, w.h), w.conf || {}, el.dataset.key);
  }
  // 日历图标的日期也会变
  for (const el of $$('[data-app="calendar"] .app-ic', $('#home'))) el.innerHTML = appIcon('calendar');
}
export function refreshBadges() {
  const counts = { social: D.chars().reduce((s, c) => s + (D.meta(c.id).unread || 0), 0), mail: D.unreadMails() };
  for (const [app, n] of Object.entries(counts)) {
    for (const el of $$(`[data-app="${app}"]`, $('#home'))) {
      el.querySelector('.badge')?.remove();
      if (n) el.append(h('i', { class: 'badge', text: n > 99 ? '99+' : n }));
    }
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
  if (on) { measure(); return; }
  // 整理完：空着的页收掉（至少留一页），停在原来看着的那页
  if (layout.pages.length > 1 && layout.pages.some((pg) => !pg.length)) {
    const cur = pageArr();
    layout.pages = layout.pages.filter((pg) => pg.length);
    if (!layout.pages.length) layout.pages = [[]];
    const at = layout.pages.indexOf(cur);
    render();
    goPage(at >= 0 ? at : Math.min(page, layout.pages.length - 1), false);
  }
  save();
}

// ── 点、长按、拖 ──
let dragging = null;
function wireItem(el) {
  const key = el.dataset.key;
  let pid = null, x0 = 0, y0 = 0, t = 0, moved = false, long = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wg-del')) return;
    if (e.target.closest('.wg-rs')) { if (editing) startResize(el, e); return; }
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
    if (key.startsWith('app:')) { openApp(key.slice(4)); return; }
    const w = layout.widgets[key], def = WIDGETS[w.type];
    // 相册小组件还没放图：点一下就去放
    if (w.type === 'photo' && !(w.conf?.files || []).some((f) => D.file(f))) { photoSheet(key); return; }
    const to = typeof def.open === 'function' ? def.open(w.conf || {}) : def.open;
    if (to) openApp(to);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { pid = null; clearTimeout(t); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.querySelector('.wg-del')?.addEventListener('click', (e) => {
    e.stopPropagation();
    for (const f of layout.widgets[key]?.conf?.files || []) D.setFile(f, null); // 它自己的图也不留
    remove(layout, key);
    delete layout.widgets[key];
    render(); save();
  });
}
function remove(L, key) { L.pages = L.pages.map((pg) => pg.filter((it) => it.k !== key)); L.dock = L.dock.filter((k) => k !== key); }
/** 东西在哪：{ p, x, y }（某一页）或 { dock: 第几个 } */
function locate(L, key) {
  const d = L.dock.indexOf(key);
  if (d >= 0) return { dock: d };
  for (let p = 0; p < L.pages.length; p++) { const it = L.pages[p].find((x) => x.k === key); if (it) return { p, x: it.x, y: it.y }; }
  return {};
}
const liftEl = (key) => $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('lift');

function startDrag(el, e) {
  const key = el.dataset.key, isApp = key.startsWith('app:');
  measure();
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', gridColumn: '', gridRow: '' });
  document.body.append(ghost);
  el.classList.add('lift');
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  dragging = { key, ghost };
  // 拖之前的样子（不算它自己）：每次落点变了，都从这里重新排一遍，所以中途经过的地方不会把别的东西弄乱
  const from = locate(layout, key);
  const base = structuredClone(layout);
  remove(base, key);
  const [kw, kh] = dimsIn(layout, key);
  let sig = '', done = '', pend = 0, edgeT = 0, edgeDir = 0, lastEv = e, busyUntil = 0;
  const apply = (t) => {
    done = JSON.stringify(t);
    const L = structuredClone(base);
    if (t.dock != null) {
      if (L.dock.length < 4) L.dock.splice(t.dock, 0, key);
      else {
        // Dock 满了：跟那个换，换下来的放回被拖的这个原来的地方
        const out = L.dock[t.dock];
        L.dock[t.dock] = key;
        const p = from.p != null ? from.p : page;
        const items = L.pages[p];
        items.push({ k: out, ...(from.p != null && fits(L, items, from.x, from.y, 1, 1) ? { x: from.x, y: from.y } : nearestFree(L, items, from.x || 0, from.y || 0, 1, 1)) });
      }
    } else {
      while (L.pages.length <= t.p) L.pages.push([]);
      L.pages[t.p] = arrange(L, L.pages[t.p], key, t.x, t.y, from.p === t.p ? { x: from.x, y: from.y } : null);
    }
    layout = L;
    render();
    liftEl(key);
  };
  const targetOf = (ev) => {
    const dr = dockEl.getBoundingClientRect();
    if (ev.clientY >= dr.top - 4) {
      if (!isApp) return null;
      const n = base.dock.length;
      const f = (ev.clientX - dr.left) / Math.max(1, dr.width);
      return { dock: n < 4 ? Math.max(0, Math.min(n, Math.round(f * (n + 1) - 0.5))) : Math.max(0, Math.min(3, Math.floor(f * 4))) };
    }
    const c = cellAt(page, parseFloat(ghost.style.left), parseFloat(ghost.style.top));
    const maxY = Math.max(rows, bottomOf(base, base.pages[page] || [])) - kh;
    return { p: page, x: Math.max(0, Math.min(COLS - kw, c.x)), y: Math.max(0, Math.min(maxY, c.y)) };
  };
  // 拖到屏幕左右边上停一下：翻到隔壁那页（最后一页的右边：多出一页）
  const flipPage = () => {
    edgeT = 0;
    const dir = edgeDir;
    if (!dragging || !dir) return;
    const to = page + dir;
    if (to < 0) return;
    if (to > layout.pages.length - 1) {
      if (!(base.pages[page] || []).length) return; // 这页除了它没别的，再多一页没意义
      base.pages.push([]);
      layout.pages.push([]);
      render();
      liftEl(key);
    }
    goPage(to);
    busyUntil = performance.now() + 360; // 等翻页的动画走完再算落点
    setTimeout(() => dragging && move(lastEv), 380);
  };
  const move = (ev) => {
    lastEv = ev;
    ghost.style.left = ev.clientX - ox + 'px';
    ghost.style.top = ev.clientY - oy + 'px';
    const dev = pagesEl.getBoundingClientRect();
    const dir = ev.clientY >= dockEl.getBoundingClientRect().top ? 0 : ev.clientX < dev.left + 26 ? -1 : ev.clientX > dev.right - 26 ? 1 : 0;
    if (dir !== edgeDir) { edgeDir = dir; clearTimeout(edgeT); edgeT = dir ? setTimeout(flipPage, 620) : 0; }
    else if (dir && !edgeT) edgeT = setTimeout(flipPage, 900);
    if (performance.now() < busyUntil) return;
    const t = targetOf(ev);
    const s = JSON.stringify(t);
    if (!t || s === sig) return;
    sig = s;
    clearTimeout(pend);
    // 手指停一下再挪，划过去的时候别的东西不会跟着乱跳
    pend = setTimeout(() => dragging && apply(t), 110);
  };
  const end = () => {
    clearTimeout(edgeT); clearTimeout(pend);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    // 松手的地方还没来得及排：现在排
    const t = performance.now() >= busyUntil ? targetOf(lastEv) : null;
    if (t && JSON.stringify(t) !== done) apply(t);
    const now = $(`#home [data-key="${CSS.escape(key)}"]`);
    if (now) {
      const b = now.getBoundingClientRect(), g = ghost.getBoundingClientRect();
      ghost.animate([{ left: g.left + 'px', top: g.top + 'px' }, { left: b.left + 'px', top: b.top + 'px' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { ghost.remove(); now.classList.remove('lift'); };
    } else ghost.remove();
    dragging = null;
    swipedAt = Date.now();
    save();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ── 改大小：拖小组件角上的小角，松手对齐格子；挤到的东西让到最近的空位 ──
function startResize(el, e) {
  e.preventDefault(); e.stopPropagation();
  const key = el.dataset.key, w = layout.widgets[key];
  const at = locate(layout, key);
  if (at.p == null) return;
  measure();
  const base = structuredClone(layout);
  const r0 = el.getBoundingClientRect();
  const colStep = (r0.width + GAP_X) / w.w, rowStep = rowH + GAP_Y;
  const leftSide = at.x > 0 && at.x + w.w === COLS; // 靠右边的：小角在左下，往左拉变宽
  const right = at.x + w.w;
  let cur = `${w.w}x${w.h}`;
  dragging = { key, resize: true };
  el.classList.add('sizing');
  try { el.setPointerCapture(e.pointerId); } catch {}
  const move = (ev) => {
    const rw = leftSide ? (r0.right - ev.clientX + GAP_X / 2) / colStep : (ev.clientX - r0.left + GAP_X / 2) / colStep;
    const rh = (ev.clientY - r0.top + GAP_Y / 2) / rowStep;
    const [nw, nh] = nearestSize(w.type, rw, rh, leftSide ? right : COLS);
    if (`${nw}x${nh}` === cur) return;
    cur = `${nw}x${nh}`;
    const L = structuredClone(base);
    L.widgets[key].w = nw; L.widgets[key].h = nh;
    const x = leftSide ? right - nw : Math.min(at.x, COLS - nw);
    L.pages[at.p] = arrange(L, L.pages[at.p], key, x, at.y, null, true);
    // 变大以后，被挤到这一页看不见的地方的东西：挪到后面的页去（跟手机一样）
    const was = new Map(base.pages[at.p].map((it) => [it.k, it]));
    const over = L.pages[at.p].filter((it) => it.k !== key && it.y + dimsIn(L, it.k)[1] > rows && (was.get(it.k)?.y ?? 0) + dimsIn(L, it.k)[1] <= rows);
    if (over.length) {
      L.pages[at.p] = L.pages[at.p].filter((it) => !over.includes(it));
      for (const it of over) placeNew(L, it.k, at.p + 1);
    }
    layout = L;
    render();
    $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('sizing');
    navigator.vibrate?.(5);
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.remove('sizing');
    dragging = null;
    swipedAt = Date.now();
    save();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ── ＋：加新的一页、加小组件；点小组件：设置 ──
function addSheet() {
  const body = h('div', { class: 'wg-pick' });
  const s = sheet({ title: '添加', body });
  // 第一格：新的一页（加在最后，翻过去）。空着的页整理完会自己收掉，所以加完把东西拖进去
  body.append(h('button', { class: 'wg-pick-it', onclick: () => {
    s.close();
    if (layout.pages[layout.pages.length - 1].length) { layout.pages.push([]); render(); }
    goPage(layout.pages.length - 1);
  } }, h('div', { class: 'wg preview pg-new' }, h('span', { html: icon('plus') })), h('span', { text: '新的一页' })));
  for (const [type, def] of Object.entries(WIDGETS)) {
    const prev = h('div', { class: `wg wg-${type} sz-s preview` }, h('div', { class: 'wg-in' }));
    def.render(prev.firstChild, 's', {}, '');
    body.append(h('button', { class: 'wg-pick-it', onclick: () => {
      const key = 'w:' + D.uid();
      // 新加的先用最小的（都是 2×2），要大自己拖角；大的容易把这页挤满、被挤到后面的页
      const [w, hh] = def.sizes.reduce((m, s) => (s[0] * s[1] < m[0] * m[1] ? s : m));
      layout.widgets[key] = { type, w, h: hh };
      // 放在这一页第一个放得下的空位；这页满了就往后找，都满了加一页
      const p = placeNew(layout, key, page);
      s.close(); render(); goPage(p); save();
    } }, prev, h('span', { text: def.name })));
  }
}
function widgetConf(key) {
  const w = layout.widgets[key], def = WIDGETS[w.type];
  const items = [];
  if (def.conf === 'char') {
    items.push(['显示所有人的最新消息' + (!w.conf?.char ? '（现在）' : ''), () => { w.conf = {}; render(); save(); }]);
    for (const c of D.chars()) items.push([`只看 ${D.nameOf(c)}` + (w.conf?.char === c.id ? '（现在）' : ''), () => { w.conf = { char: c.id }; render(); save(); }]);
  }
  if (def.conf === 'image') { photoSheet(key); return; }
  // 倒数日：最近的一件，或者一直倒数某一件
  if (def.conf === 'event') {
    items.push(['最近的一件' + (!w.conf?.event ? '（现在）' : ''), () => { w.conf = {}; render(); save(); }]);
    const seen = new Set();
    for (const { e } of D.upcoming(3660)) {
      if (seen.has(e.id) || seen.size >= 40) continue;
      seen.add(e.id);
      items.push([e.title + (w.conf?.event === e.id ? '（现在）' : ''), () => { w.conf = { event: e.id }; render(); save(); }]);
    }
  }
  if (items.length) menu(items, def.name);
}

// ── 相册小组件的图：只放你自己的图（不进相册），可以放好几张，隔一会儿换一张 ──
function photoSheet(key) {
  const w = layout.widgets[key];
  if (!w) return;
  const grid = h('div', { class: 'wp-grid' });
  const s = sheet({ title: '小组件的图', body: grid });
  const files = () => (w.conf?.files || []).filter((f) => D.file(f));
  const draw = () => {
    grid.innerHTML = '';
    for (const f of files()) {
      grid.append(h('div', { class: 'wp-it' }, h('img', { src: D.file(f), alt: '', draggable: 'false' }),
        h('button', { class: 'wp-x', 'aria-label': '去掉这张', html: icon('close'), onclick: () => {
          D.setFile(f, null);
          w.conf = { ...(w.conf || {}), files: files().filter((x) => x !== f) };
          render(); save(); draw();
        } })));
    }
    if (files().length < MAX_PICS) grid.append(h('button', { class: 'wp-it add', 'aria-label': '加图', html: icon('plus'), onclick: () => addPics() }));
  };
  function addPics() {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    document.body.append(inp);
    inp.addEventListener('change', async () => {
      const list = [...(inp.files || [])];
      inp.remove();
      const room = MAX_PICS - files().length;
      if (list.length > room) toast(`最多放 ${MAX_PICS} 张`);
      for (const f of list.slice(0, room)) {
        try {
          const src = await shrink(f, 1100, 0.86, false);
          const fk = `wg.${key}.${D.uid()}`;
          D.setFile(fk, src);
          w.conf = { ...(w.conf || {}), files: [...files(), fk] };
        } catch { toast('有一张读不出来，跳过了'); }
      }
      render(); save(); draw();
    });
    inp.click();
  }
  draw();
  if (!files().length) addPics();
}
