// 小组件：每种一个 render(el, size, conf, key)。大小按格子算（w×h，4 列），size 是给样子用的：
//   s = 2 格宽的方块，t = 2 格宽的竖条，m = 4 格宽 2 格高，l = 4 格宽 3～4 格高
// 加一种 = 在 WIDGETS 里加一项（name、sizes 能拖成哪几种大小、render、点了打开哪个 App：open 可以是函数；
//   conf：'char' 能选只看谁，'image' 能放几张自己的图，'event' 能选倒数哪件事）
import { h, avatar, icon } from '../core/ui.js';
import * as D from '../core/data.js';
import { hm, md, weekday, ymd, short } from '../core/time.js';
import { cached, describe, wxIcon, getWeather } from '../core/weather.js';
import { partPreview } from '../core/parse.js';

export const sizeClass = (w, hh) => (w <= 2 ? (hh >= 3 ? 't' : 's') : hh <= 2 ? 'm' : 'l');
/** 拖到的大小（小数格）→ 这种小组件能用的、最接近的那个。一样近的挑大的 */
export function nearestSize(type, rw, rh, maxW = 4) {
  const list = (WIDGETS[type]?.sizes || [[2, 2]]).filter(([w]) => w <= maxW);
  let best = list[0] || [2, 2], bs = Infinity;
  for (const [w, hh] of list) {
    const d = (rw - w) ** 2 + (rh - hh) ** 2 - (w * hh) * 1e-6;
    if (d < bs) { bs = d; best = [w, hh]; }
  }
  return [...best];
}

const pad = (n) => String(n).padStart(2, '0');

function clock(el, size) {
  const d = new Date();
  el.append(
    h('div', { class: 'wg-clock ' + size },
      h('b', { text: `${pad(d.getHours())}:${pad(d.getMinutes())}` }),
      h('span', { text: `${md(d)} ${weekday(d)}` }),
      size === 'l' ? h('div', { class: 'wg-quote', text: dayLine() }) : null));
}
function dayLine() {
  const d = new Date(), y0 = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((d - y0) / 86400000) + 1;
  return `今年的第 ${day} 天`;
}

function weather(el, size) {
  const w = D.weatherConf(), d = cached();
  if (!w) { el.append(h('div', { class: 'wg-empty' }, h('b', { text: '天气' }))); return; }
  if (!d?.current) { getWeather().then(() => D.emit('weather')).catch(() => {}); el.append(h('div', { class: 'wg-empty' }, h('b', { text: w.name }), h('span', { text: '正在获取…' }))); return; }
  const [txt, kind] = describe(d.current.weather_code);
  const top = h('div', { class: 'wg-wx-top' },
    h('div', {}, h('small', { text: w.name }), h('b', { text: Math.round(d.current.temperature_2m) + '°' })),
    h('span', { class: 'wg-wx-ic', html: wxIcon(kind, size === 's' ? 30 : 36) }));
  const sub = h('div', { class: 'wg-wx-sub' }, h('span', { text: txt }), h('span', { text: `${Math.round(d.daily.temperature_2m_min[0])}° / ${Math.round(d.daily.temperature_2m_max[0])}°` }));
  const box = h('div', { class: 'wg-wx ' + size }, top, sub);
  if (size !== 's') {
    const days = h('div', { class: 'wg-wx-days' });
    const n = size === 'l' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const t = new Date(d.daily.time[i] + 'T12:00:00');
      days.append(h('div', {}, h('small', { text: i ? '周' + '日一二三四五六'[t.getDay()] : '今天' }), h('span', { html: wxIcon(describe(d.daily.weather_code[i])[1], 20) }), h('b', { text: Math.round(d.daily.temperature_2m_max[i]) + '°' })));
    }
    box.append(days);
  }
  el.append(box);
}

// 日程：今天的（没打勾的在前）+ 往后的。每件前面一个小圆圈，点一下打勾（data-ck 由 home.js 处理）
const daysTo = (date) => Math.round((new Date(date + 'T00:00:00') - new Date(ymd() + 'T00:00:00')) / 86400000);
const agenda = (n) => D.upcoming(60).slice(0, n);
const whenText = (at) => { const n = daysTo(at); return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : n + ' 天后'; };
function agendaEl(items, size) {
  if (!items.length) return h('div', { class: 'wg-ag none', text: '没有日程' });
  return h('div', { class: 'wg-ag ' + size }, items.map(({ e, at, done }) =>
    h('div', { class: 'wg-ag-it' + (done ? ' done' : '') },
      h('button', { class: 'wg-ck', 'data-ck': `${e.id}|${at}`, 'aria-label': done ? '取消完成' : '完成', html: icon(done ? 'ringck' : 'ring') }),
      h('span', { class: 'wg-ag-t', text: e.title }),
      size !== 's' ? h('em', { text: whenText(at) }) : null)));
}

function calendar(el, size) {
  const d = new Date();
  if (size === 'l') {
    const grid = h('div', { class: 'wg-month' });
    for (const w of '日一二三四五六') grid.append(h('i', { text: w }));
    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const marks = new Set(D.upcoming(40).map((x) => x.at));
    for (let i = 0; i < first; i++) grid.append(h('span'));
    for (let i = 1; i <= days; i++) {
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(i)}`;
      grid.append(h('span', { class: (i === d.getDate() ? 'on' : '') + (marks.has(key) ? ' dot' : ''), text: i }));
    }
    const rows = Math.ceil((first + days) / 7);
    el.append(h('div', { class: 'wg-cal l' }, h('b', { text: `${d.getMonth() + 1}月` }), grid, agendaEl(agenda(rows > 5 ? 2 : 3), 'l')));
    return;
  }
  const head = h('div', { class: 'wg-cal-h' }, h('small', { text: weekday(d) }), h('b', { text: d.getDate() }));
  el.append(h('div', { class: 'wg-cal ' + size }, head, agendaEl(agenda(size === 's' ? 2 : 4), size)));
}

function latestMsg(conf) {
  let best = null;
  for (const c of D.chars()) {
    if (conf?.char && conf.char !== c.id) continue;
    const list = D.msgs(c.id);
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (r.role !== 'them') continue;
      const ps = D.partsOf(r);
      if (!ps.length) continue;
      if (!best || r.ts > best.ts) best = { c, ts: r.ts, text: partPreview(ps[ps.length - 1]) };
      break;
    }
  }
  return best;
}
function chat(el, size, conf) {
  const m = latestMsg(conf);
  if (!m) { el.append(h('div', { class: 'wg-empty' }, h('b', { text: '消息' }), h('span', { text: '还没有人给你发消息' }))); return; }
  el.append(h('div', { class: 'wg-chat ' + size },
    h('div', { class: 'wg-chat-h' }, avatar(m.c.avatar, D.nameOf(m.c), 'sm'), h('b', { text: D.nameOf(m.c) }), h('small', { text: short(m.ts) })),
    h('p', { text: m.text })));
}

// 相册小组件：只放你自己的图（整理时点它放，可以好几张，不进相册），隔 10 分钟换一张，淡入淡出。没有图就空着
const ROT = 10 * 60000;
const shown = new Map(); // 小组件 → 上次显示的那张（换的时候从它淡到新的）
const seedOf = (s) => { let x = 7; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
function photo(el, size, conf, key = '') {
  const srcs = (conf?.files || []).map((f) => D.file(f)).filter(Boolean);
  if (!srcs.length) { el.append(h('div', { class: 'wg-photo none ' + size }, h('span', { html: icon('image') }))); return; }
  const src = srcs[(Math.floor(Date.now() / ROT) + seedOf(key)) % srcs.length];
  const prev = shown.get(key);
  shown.set(key, src);
  const box = h('div', { class: 'wg-photo img ' + size });
  if (prev && prev !== src) box.append(h('img', { class: 'under', src: prev, alt: '', draggable: 'false' }));
  box.append(h('img', { class: prev && prev !== src ? 'fade' : '', src, alt: '', draggable: 'false' }));
  el.append(box);
}

// 倒数日：离日历里下一件（没打勾的）事还有几天；也可以一直倒数某一件（整理时点它选）
function countdown(el, size, conf) {
  const list = D.upcoming(3660).filter((x) => !x.done);
  const it = conf?.event ? list.find((x) => x.e.id === conf.event) : list[0];
  if (!it) { el.append(h('div', { class: 'wg-empty' }, h('span', { text: '没有日程' }))); return; }
  const n = daysTo(it.at);
  el.append(h('div', { class: 'wg-cd ' + size },
    h('small', { text: it.e.title }),
    h('div', { class: 'wg-cd-n' }, n === 0 ? h('b', { class: 'today', text: '今天' }) : [h('b', { text: n }), h('span', { text: '天' })]),
    h('em', { text: md(new Date(it.at + 'T12:00:00').getTime()) + (it.e.yearly ? ' · 每年' : '') })));
}

const S3 = [[2, 2], [4, 2], [4, 4]];
export const WIDGETS = {
  clock: { name: '时间', sizes: S3, render: clock, open: null },
  weather: { name: '天气', sizes: S3, render: weather, open: 'weather' },
  calendar: { name: '日历', sizes: S3, render: calendar, open: 'calendar' },
  chat: { name: '最近消息', sizes: [[2, 2], [4, 2]], render: chat, open: 'social', conf: 'char' },
  photo: { name: '相册', sizes: [[2, 2], [2, 3], [2, 4], [4, 2], [4, 3], [4, 4]], render: photo, open: null, conf: 'image' },
  countdown: { name: '倒数日', sizes: [[2, 2], [4, 2]], render: countdown, open: 'calendar', conf: 'event' },
};
