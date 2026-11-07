// 锁屏：时间、日期、未读消息。往上滑解锁；设了密码就先输密码（密码在 设置 → 锁屏密码）
import { h, $, avatar } from '../core/ui.js';
import * as D from '../core/data.js';
import { hm, md, weekday, short } from '../core/time.js';
import { partPreview } from '../core/parse.js';
import { appIcon } from './icons.js';

let locked = false, onOpen = null, hiddenAt = 0, timer = 0;
const RELOCK = 2 * 60 * 1000; // 切出去超过两分钟再回来就锁上

export const isLocked = () => locked;

export function initLock(open) {
  onOpen = open;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK) lock();
  });
  for (const ev of ['msgs', 'meta', 'chars', 'account', 'mails']) D.on(ev, () => locked && renderNotes());
  lock();
}

export function lock() {
  locked = true;
  const el = $('#lock');
  el.hidden = false;
  el.classList.remove('gone');
  el.style.transform = '';
  el.innerHTML = '';
  const time = h('div', { class: 'lk-time' });
  const date = h('div', { class: 'lk-date' });
  const tickFn = () => { const t = Date.now(); time.textContent = hm(t); date.textContent = `${md(t)} ${weekday(t)}`; };
  tickFn();
  clearInterval(timer);
  timer = setInterval(tickFn, 10000);
  const notes = h('div', { class: 'lk-notes' });
  const hint = h('div', { class: 'lk-hint', text: D.lockConf().pass ? '上滑输入密码' : '上滑解锁' });
  el.append(h('div', { class: 'lk-head' }, date, time), notes, hint, h('div', { class: 'home-bar' }, h('i')));
  renderNotes();
  wireSwipe(el);
}

function renderNotes() {
  const box = $('#lock .lk-notes');
  if (!box) return;
  box.innerHTML = '';
  const items = [];
  for (const c of D.chars()) {
    const n = D.meta(c.id).unread;
    if (!n) continue;
    const list = D.msgs(c.id);
    const last = [...list].reverse().find((r) => r.role === 'them' && D.partsOf(r).length);
    if (!last) continue;
    const ps = D.partsOf(last);
    items.push({ c, n, ts: last.ts, text: partPreview(ps[ps.length - 1]) });
  }
  // 没读的邮件也放上来
  for (const m of D.mails().filter((x) => x.acc === D.curAccount().id && x.box === 'inbox' && !x.read)) {
    const c = m.char ? D.charById(m.char) : null;
    items.push({ mail: m, ts: m.ts, title: c ? D.nameOf(c) : m.fromName || m.from, text: m.subject || '（无主题）', c });
  }
  items.sort((a, b) => b.ts - a.ts);
  for (const it of items.slice(0, 4)) {
    const open = it.mail ? () => onOpen('mail', { mail: it.mail.id }) : () => onOpen('social', { chat: it.c.id });
    box.append(h('button', { class: 'lk-note', onclick: (e) => { e.stopPropagation(); unlock(open); } },
      it.mail ? h('span', { class: 'lk-mail', html: appIcon('mail') }) : avatar(it.c.avatar, D.nameOf(it.c), 'sm'),
      h('div', { class: 'lk-note-b' },
        h('div', { class: 'lk-note-t' }, h('b', { text: it.mail ? it.title : D.nameOf(it.c) }), h('small', { text: short(it.ts) })),
        h('p', { text: it.mail ? it.text : it.n > 1 ? `[${it.n}条] ${it.text}` : it.text }))));
  }
  if (items.length > 4) box.append(h('div', { class: 'lk-more', text: `还有 ${items.length - 4} 条` }));
}

function wireSwipe(el) {
  let id = null, y0 = 0, dy = 0, t0 = 0;
  el.onpointerdown = (e) => { if (e.target.closest('.lk-note')) return; id = e.pointerId; y0 = e.clientY; dy = 0; t0 = performance.now(); el.setPointerCapture(id); el.style.transition = 'none'; };
  el.onpointermove = (e) => { if (e.pointerId !== id) return; dy = Math.min(0, e.clientY - y0); el.style.transform = `translateY(${dy * 0.6}px)`; el.style.opacity = 1 + dy / 900; };
  el.onpointerup = el.onpointercancel = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.style.transition = '';
    const fast = dy < -40 && performance.now() - t0 < 260;
    if (dy < -110 || fast) unlock();
    else { el.style.transform = ''; el.style.opacity = ''; }
  };
}

function unlock(then) {
  const pass = D.lockConf().pass;
  if (pass) { pad(pass, () => { open(); then && then(); }); return; }
  open();
  then && then();
}
function open() {
  locked = false;
  clearInterval(timer);
  const el = $('#lock');
  el.classList.add('gone');
  el.style.transform = '';
  el.style.opacity = '';
  setTimeout(() => { if (!locked) el.hidden = true; }, 420);
  document.dispatchEvent(new Event('unlocked'));
}

function pad(pass, ok) {
  const el = $('#lock');
  el.style.transform = ''; el.style.opacity = '';
  let typed = '';
  const dots = h('div', { class: 'pd-dots' });
  const draw = () => { dots.innerHTML = ''; for (let i = 0; i < pass.length; i++) dots.append(h('i', { class: i < typed.length ? 'on' : '' })); };
  draw();
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); };
  const press = (k) => {
    navigator.vibrate?.(5);
    if (k === 'del') { typed = typed.slice(0, -1); draw(); return; }
    typed += k;
    draw();
    if (typed.length === pass.length) {
      if (typed === pass) { setTimeout(() => { close(); ok(); }, 120); }
      else { dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); typed = ''; draw(); }, 420); }
    }
  };
  const keys = h('div', { class: 'pd-keys' });
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']) {
    if (!k) { keys.append(h('span')); continue; }
    keys.append(h('button', { class: k === 'del' ? 'del' : '', text: k === 'del' ? '删除' : k, onclick: (e) => { e.stopPropagation(); press(k); } }));
  }
  const wrap = h('div', { class: 'pd-wrap' },
    h('div', { class: 'pd-t', text: '输入密码' }), dots, keys,
    h('button', { class: 'pd-cancel', text: '取消', onclick: (e) => { e.stopPropagation(); close(); } }));
  el.append(wrap);
  wrap.onpointerdown = (e) => e.stopPropagation();
  requestAnimationFrame(() => wrap.classList.add('on'));
}
