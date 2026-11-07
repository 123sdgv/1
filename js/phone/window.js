// 打开 App：从图标的位置放大出来；底部横条往上滑（或点一下）缩回图标
import { h, $, toast } from '../core/ui.js';
import { appById } from './apps.js';

let cur = null; // { id, win, inst, from }
const EASE = 'cubic-bezier(.2,.85,.25,1)';
export const currentApp = () => cur?.id || null;

function iconRect(id) {
  const el = document.querySelector(`#home [data-app="${id}"] .app-ic`);
  return el ? el.getBoundingClientRect() : null;
}
function zoomFrames(win, r) {
  const dev = $('#device').getBoundingClientRect();
  if (!r || !r.width) return [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }];
  const sx = r.width / dev.width, sy = r.height / dev.height;
  const tx = r.left - dev.left, ty = r.top - dev.top;
  return [
    { transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`, borderRadius: `${r.width * 0.22 / sx}px / ${r.height * 0.22 / sy}px`, opacity: 0.4 },
    { transform: 'translate(0,0) scale(1,1)', borderRadius: '0px', opacity: 1 },
  ];
}

export async function openApp(id, arg) {
  if (cur && cur.id === id) { cur.inst?.go?.(arg); return; }
  if (cur) closeApp(true);
  const app = appById(id);
  if (!app) return;
  const body = h('div', { class: 'win-body' });
  const bar = h('div', { class: 'home-bar' }, h('i'));
  const win = h('section', { class: 'win', 'data-id': id }, body, bar);
  $('#windows').append(win);
  document.body.classList.add('in-app');
  const state = { id, win, inst: null };
  cur = state;
  win.animate(zoomFrames(win, iconRect(id)), { duration: 380, easing: EASE });
  wireBar(bar);
  try {
    const mod = await app.load();
    if (cur !== state) return;
    state.inst = (await mod.mount(body, { close: () => closeApp(), openApp, arg })) || {};
  } catch (e) {
    console.error(e);
    toast('这个 App 打不开：' + e.message);
  }
}

export function closeApp(instant = false) {
  if (!cur) return;
  const { id, win, inst } = cur;
  cur = null;
  try { inst?.destroy?.(); } catch (e) { console.error(e); }
  document.body.classList.remove('in-app');
  document.dispatchEvent(new CustomEvent('app-closed', { detail: id }));
  if (instant) { win.remove(); return; }
  const f = zoomFrames(win, iconRect(id)).reverse();
  f[1].opacity = 0;
  win.style.pointerEvents = 'none';
  win.animate(f, { duration: 320, easing: EASE, fill: 'forwards' }).onfinish = () => win.remove();
}

// 横条：往上滑一段就回主屏幕，点一下也回
function wireBar(bar) {
  let id = null, y0 = 0, dy = 0;
  bar.addEventListener('pointerdown', (e) => { id = e.pointerId; y0 = e.clientY; dy = 0; bar.setPointerCapture(id); });
  bar.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || !cur) return;
    dy = Math.min(0, e.clientY - y0);
    const k = Math.max(0.82, 1 + dy / 900);
    cur.win.style.transform = `translateY(${dy * 0.5}px) scale(${k})`;
    cur.win.style.borderRadius = Math.min(40, -dy / 3) + 'px';
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!cur) return;
    if (dy < -60 || Math.abs(dy) < 4) { cur.win.style.transform = ''; cur.win.style.borderRadius = ''; closeApp(); }
    else { cur.win.style.transition = 'transform .25s, border-radius .25s'; cur.win.style.transform = ''; cur.win.style.borderRadius = ''; setTimeout(() => cur && (cur.win.style.transition = ''), 260); }
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}
