// 主屏幕：可以有好几页，左右滑着翻。每页 4 列格子，App 占 1 格，小组件占 2×2 / 4×2 / 4×4。底下 Dock 放 4 个 App（每页都一样）。
// 长按进入整理：拖动换位置（App 能在格子和 Dock 之间拖；拖到屏幕左右边上停一下就翻到隔壁那页，拖到最后一页的右边会多出一页），
// 小组件可以换大小、删掉；左上角 ＋ 加小组件、加新的一页。整理完，空着的页自己收掉。
import { h, $, $$, sheet, menu, icon } from '../core/ui.js';
import * as D from '../core/data.js';
import { APPS, appById } from './apps.js';
import { appIcon } from './icons.js';
import { WIDGETS } from './widgets.js';
import { openApp } from './window.js';
import { pickCrop } from '../core/crop.js';

const SIZES = { s: [2, 2], m: [4, 2], l: [4, 4] };
const SIZE_NAME = { s: '小', m: '中', l: '大' };

// 布局：{ pages: [[格子里的东西…], …], dock: […], widgets: { 'w:xx': { type, size, conf } } }
// 老存档只有一页，存的是 grid：读的时候当成第一页
function defaultLayout() {
  return {
    pages: [['w:a', 'w:b', 'app:offline', 'app:diary', 'app:memo', 'app:weather', 'w:c']],
    dock: ['app:social', 'app:album', 'app:calendar', 'app:settings'],
    widgets: { 'w:a': { type: 'clock', size: 'm' }, 'w:b': { type: 'weather', size: 's' }, 'w:c': { type: 'chat', size: 'm' } },
  };
}
function fixLayout(l) {
  l ||= defaultLayout();
  l.widgets ||= {};
  if (!Array.isArray(l.pages)) l.pages = [Array.isArray(l.grid) ? l.grid : []];
  delete l.grid;
  // 去重 + 补上新加的 App（自动放进最后一页的末尾）
  const seen = new Set();
  l.dock = (l.dock || []).filter((k) => !seen.has(k) && seen.add(k) && k.startsWith('app:') && appById(k.slice(4))).slice(0, 4);
  l.pages = l.pages.filter(Array.isArray).map((pg) => pg.filter((k) => !seen.has(k) && seen.add(k) && (k.startsWith('w:') ? l.widgets[k] && WIDGETS[l.widgets[k].type] : appById(k.slice(4)))));
  if (!l.pages.length) l.pages = [[]];
  for (const a of APPS) if (!seen.has('app:' + a.id)) l.pages[l.pages.length - 1].push('app:' + a.id);
  // 只留一页时不留空页；有好几页时空页先留着（整理完再收）
  return l;
}
const L = () => fixLayout(structuredClone(D.layout()));

let layout, editing = false, pagesEl, stripEl, dotsEl, dockEl, refreshT = 0, page = 0, swipedAt = 0;
const pageArr = () => layout.pages[page];
/** 这个东西现在在哪个数组里（某一页，或者 Dock） */
const arrOf = (key) => (layout.dock.includes(key) ? layout.dock : layout.pages.find((pg) => pg.includes(key)) || null);

export function buildHome() {
  layout = L();
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
  home.addEventListener('click', (e) => {
    if (!editing || Date.now() - swipedAt < 350) return;
    if (e.target === home || e.target.matches?.('.grid, .home-page, .home-pages, .home-strip, .home-dots')) setEdit(false);
  });
  wireSwipe();
  render();
  goPage(0, false);
  for (const ev of ['msgs', 'meta', 'chars', 'weather', 'events', 'photos', 'account']) D.on(ev, () => { clearTimeout(refreshT); refreshT = setTimeout(refreshWidgets, 200); });
  D.on('mails', refreshBadges);
  setInterval(refreshWidgets, 20000);
  D.on('meta', refreshBadges);
  D.on('chars', refreshBadges);
  D.on('account', refreshBadges);
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
  const tops = $$('.home-page', stripEl).map((x) => x.scrollTop);
  stripEl.innerHTML = '';
  dockEl.innerHTML = '';
  layout.pages.forEach((keys, i) => {
    const grid = h('div', { class: 'grid' }, keys.map(itemEl));
    const pg = h('div', { class: 'home-page', 'data-page': i }, grid);
    stripEl.append(pg);
    if (tops[i]) pg.scrollTop = tops[i];
  });
  for (const k of layout.dock) dockEl.append(itemEl(k));
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
    WIDGETS[w.type].render(inner, w.size, w.conf || {});
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
  if (on) return;
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
    else { const w = layout.widgets[key], def = WIDGETS[w.type], to = typeof def.open === 'function' ? def.open(w.conf || {}) : def.open; if (to) openApp(to); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { pid = null; clearTimeout(t); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.querySelector('.wg-del')?.addEventListener('click', (e) => {
    e.stopPropagation();
    remove(key);
    if (layout.widgets[key]?.conf?.file) D.setFile(layout.widgets[key].conf.file, null); // 它自己的那张图也不留
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
  let lastSwap = 0, edgeT = 0, edgeDir = 0, lastEv = e, againT = 0;
  // 拖到屏幕左右边上停一下：翻到隔壁那页（最后一页的右边：多出一页）
  const flipPage = () => {
    edgeT = 0;
    const dir = edgeDir;
    if (!dragging || !dir || layout.dock.includes(key)) return;
    let to = page + dir;
    if (to < 0) return;
    if (to > layout.pages.length - 1) {
      if (!pageArr().some((k) => k !== key)) return; // 这页只有它自己，再多一页没意义
      layout.pages.push([]);
      render();
      $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('lift');
    }
    goPage(to);
    lastSwap = performance.now() + 260; // 等翻页的动画走完再落位
    setTimeout(() => dragging && move(lastEv), 460);
  };
  const move = (ev) => {
    lastEv = ev;
    ghost.style.left = ev.clientX - ox + 'px';
    ghost.style.top = ev.clientY - oy + 'px';
    const dev = pagesEl.getBoundingClientRect();
    const dir = ev.clientX < dev.left + 26 ? -1 : ev.clientX > dev.right - 26 ? 1 : 0;
    if (dir !== edgeDir) { edgeDir = dir; clearTimeout(edgeT); edgeT = dir ? setTimeout(flipPage, 620) : 0; }
    else if (dir && !edgeT) edgeT = setTimeout(flipPage, 900);
    // 刚换过位置，先等一下；手指要是正好停住不动了，过一会儿自己再看一眼落在哪
    clearTimeout(againT);
    if (performance.now() - lastSwap < 180) { againT = setTimeout(() => dragging && move(lastEv), 200); return; }
    ghost.style.display = 'none';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    ghost.style.display = '';
    const target = under?.closest('[data-key]');
    const inDock = !!under?.closest('#dock');
    if (target && target.dataset.key !== key) { if (moveTo(key, target.dataset.key)) lastSwap = performance.now(); }
    else if (!target && inDock && key.startsWith('app:') && !layout.dock.includes(key) && layout.dock.length < 4) { remove(key); layout.dock.push(key); relift(); }
    // 拖到这一页的空白处：它不在这页（在别的页或者 Dock 里）就挪过来，放到末尾
    else if (!target && !inDock && under?.closest('.home-pages') && arrOf(key) !== pageArr()) { remove(key); pageArr().push(key); relift(); }
  };
  const relift = () => { render(); $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('lift'); lastSwap = performance.now(); };
  const end = () => {
    clearTimeout(edgeT); clearTimeout(againT);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
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
function remove(key) { layout.pages = layout.pages.map((pg) => pg.filter((k) => k !== key)); layout.dock = layout.dock.filter((k) => k !== key); }
function moveTo(key, targetKey) {
  const arrFrom = arrOf(key), arrTo = arrOf(targetKey);
  if (!arrFrom || !arrTo) return false;
  const fromDock = arrFrom === layout.dock, toDock = arrTo === layout.dock;
  if (toDock && key.startsWith('w:')) return false;
  if (toDock && !fromDock && layout.dock.length >= 4) {
    // Dock 满了：和那个图标对换
    arrTo[arrTo.indexOf(targetKey)] = key; arrFrom[arrFrom.indexOf(key)] = targetKey;
  } else {
    const from = arrFrom.indexOf(key), to = arrTo.indexOf(targetKey);
    arrFrom.splice(from, 1);
    const idx = arrTo.indexOf(targetKey);
    arrTo.splice(arrFrom === arrTo && from <= to ? idx + 1 : idx, 0, key);
  }
  render();
  $(`#home [data-key="${CSS.escape(key)}"]`)?.classList.add('lift');
  return true;
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
    def.render(prev.firstChild, 's', {});
    body.append(h('button', { class: 'wg-pick-it', onclick: () => {
      const key = 'w:' + D.uid();
      layout.widgets[key] = { type, size: def.sizes.includes('m') ? 'm' : def.sizes[0] };
      pageArr().unshift(key);
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
  // 相册小组件：放一张自己的图（按小组件现在的形状裁）。图只跟着这个小组件，不进相册
  if (def.conf === 'image') {
    const fk = 'wg.' + key, has = !!D.file(fk);
    items.push([has ? '换一张图' : '放一张自己的图', async () => {
      const el = $(`#home [data-key="${CSS.escape(key)}"]`), r = el?.getBoundingClientRect();
      const src = (await pickCrop({ aspect: r && r.height ? r.width / r.height : 1, width: 900, title: '小组件的图', quality: 0.86 }))?.src;
      if (!src) return;
      D.setFile(fk, src);
      w.conf = { ...(w.conf || {}), file: fk };
      render(); save();
    }]);
    if (has) items.push(['不用图了', () => { D.setFile(fk, null); w.conf = {}; render(); save(); }]);
  }
  menu(items, def.name);
}
