// 小组件：每种一个 render(el, size, conf)。尺寸 s=2×2 格，m=4×2 格，l=4×4 格。
// 加一种 = 在 WIDGETS 里加一项（name、sizes、render、点了打开哪个 App）
import { h, avatar } from '../core/ui.js';
import * as D from '../core/data.js';
import { hm, md, weekday, ymd, short } from '../core/time.js';
import { cached, describe, wxIcon, getWeather } from '../core/weather.js';
import { partPreview } from '../core/parse.js';

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
  if (!w) { el.append(h('div', { class: 'wg-empty' }, h('b', { text: '天气' }), h('span', { text: '去天气 App 里选个城市' }))); return; }
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

function nextEvents(n) {
  const today = ymd(), out = [];
  for (const e of D.events()) {
    let date = e.date;
    if (e.yearly) { const y = new Date().getFullYear(); date = `${y}${e.date.slice(4)}`; if (date < today) date = `${y + 1}${e.date.slice(4)}`; }
    if (date >= today) out.push({ ...e, at: date });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, n);
}
const daysTo = (date) => Math.round((new Date(date + 'T00:00:00') - new Date(ymd() + 'T00:00:00')) / 86400000);

function calendar(el, size) {
  const d = new Date();
  if (size === 'l') {
    const grid = h('div', { class: 'wg-month' });
    for (const w of '日一二三四五六') grid.append(h('i', { text: w }));
    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const marks = new Set(nextEvents(50).map((e) => e.at));
    for (let i = 0; i < first; i++) grid.append(h('span'));
    for (let i = 1; i <= days; i++) {
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(i)}`;
      grid.append(h('span', { class: (i === d.getDate() ? 'on' : '') + (marks.has(key) ? ' dot' : ''), text: i }));
    }
    el.append(h('div', { class: 'wg-cal l' }, h('b', { text: `${d.getMonth() + 1}月` }), grid));
    return;
  }
  const evs = nextEvents(size === 's' ? 1 : 3);
  const head = h('div', { class: 'wg-cal-h' }, h('small', { text: weekday(d) }), h('b', { text: d.getDate() }));
  const list = h('div', { class: 'wg-cal-ev' }, evs.length
    ? evs.map((e) => { const n = daysTo(e.at); return h('div', {}, h('span', { text: e.title }), h('em', { text: n ? `${n} 天后` : '今天' })); })
    : h('div', { class: 'none', text: '没有日程' }));
  el.append(h('div', { class: 'wg-cal ' + size }, head, list));
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

function photo(el, size) {
  const list = D.photosOf();
  if (!list.length) { el.append(h('div', { class: 'wg-empty' }, h('b', { text: '相册' }), h('span', { text: '还没有照片' }))); return; }
  // 每天换一张
  const seed = Number(ymd().replace(/-/g, ''));
  const p = list[seed % list.length];
  el.append(h('div', { class: 'wg-photo ' + size }, h('p', { text: p.desc }), h('small', { text: md(p.ts) })));
}

export const WIDGETS = {
  clock: { name: '时间', sizes: ['s', 'm', 'l'], render: clock, open: null },
  weather: { name: '天气', sizes: ['s', 'm', 'l'], render: weather, open: 'weather' },
  calendar: { name: '日历', sizes: ['s', 'm', 'l'], render: calendar, open: 'calendar' },
  chat: { name: '最近消息', sizes: ['s', 'm'], render: chat, open: 'social', conf: 'char' },
  photo: { name: '相册', sizes: ['s', 'm', 'l'], render: photo, open: 'album' },
};
