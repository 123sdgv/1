// 日历：你的日程和纪念日（整台手机共用）。前面的小圆圈点一下就是做完了，往左滑露出红色删除。
// 角色能看到接下来 30 天的，也能自己往里记（聊天里的 [日程]，他记的生日可以是每年的）。有日记的日子也标出来。
import { h, Stack, page, btnIc, sheet, group, inputRow, areaRow, toast, icon, swipeRow } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { ymd } from '../../core/time.js';
import { openApp } from '../../phone/window.js';

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const eventsOn = D.eventsOn;
const byName = (e) => (e.by && D.charById(e.by) ? D.nameOf(D.charById(e.by)) + ' 记的' : '');
// 一件事一行：圆圈（打勾）+ 事情 + 小字 + 右边的时间。往左滑露出删除
function evRow(e, date, right, onOpen) {
  const done = D.isDone(e, date);
  const el = h('div', { class: 'ev-row' + (done ? ' done' : '') },
    h('button', { class: 'ev-ck', 'aria-label': done ? '取消完成' : '完成', html: icon(done ? 'ringck' : 'ring'), onclick: () => {
      D.toggleDone(e.id, date);
      navigator.vibrate?.(6);
      wrap.replaceWith(evRow(D.events().find((x) => x.id === e.id) || e, date, right, onOpen));
    } }),
    h('button', { class: 'ev-main', onclick: onOpen },
      h('span', {}, h('b', { text: e.title }), h('small', { text: [e.yearly ? '每年' : '', e.note, byName(e)].filter(Boolean).join(' · ') })),
      right ? h('em', { text: right }) : null));
  const wrap = swipeRow(el, () => D.setEvents(D.events().filter((x) => x.id !== e.id)));
  return wrap;
}
function diariesOn(date) {
  const out = [];
  for (const c of D.chars()) for (const d of D.diaries(c.id)) if (d.date === date) out.push({ c, d });
  return out;
}

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  let y = new Date().getFullYear(), m = new Date().getMonth();
  const pg = page({ title: '日历', left: h('span'), right: btnIc('plus', () => edit(null, ymd()), '加日程') });
  pg.el.classList.add('cal');
  const draw = () => {
    pg.scroll.innerHTML = '';
    const today = ymd();
    const head = h('div', { class: 'cal-head' },
      h('button', { class: 'ibtn', text: '‹', onclick: () => { m--; if (m < 0) { m = 11; y--; } draw(); } }),
      h('b', { text: `${y}年${m + 1}月` }),
      h('button', { class: 'ibtn', text: '›', onclick: () => { m++; if (m > 11) { m = 0; y++; } draw(); } }));
    const grid = h('div', { class: 'cal-grid' });
    for (const w of '日一二三四五六') grid.append(h('i', { text: w }));
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < first; i++) grid.append(h('span'));
    for (let d = 1; d <= days; d++) {
      const k = key(y, m, d);
      const ev = eventsOn(k).length, dy = diariesOn(k).length;
      grid.append(h('button', { class: 'cal-d' + (k === today ? ' today' : '') + (ev ? ' ev' : ''), onclick: () => day(k) },
        h('b', { text: d }), h('span', { class: 'cal-marks' }, ev ? h('i', { class: 'e' }) : null, dy ? h('i', { class: 'd' }) : null)));
    }
    pg.scroll.append(head, grid);
    // 今天和接下来的
    const soon = D.upcoming(400);
    if (soon.length) {
      pg.scroll.append(h('div', { class: 'cal-soon-t', text: '接下来' }));
      const box = h('div', { class: 'ev-list' });
      for (const { e, at } of soon.slice(0, 30)) {
        const n = Math.round((new Date(at + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        box.append(evRow(e, at, n === 0 ? '今天' : n === 1 ? '明天' : n < 7 ? n + ' 天后' : at.slice(5).replace('-', '/'), () => edit(e)));
      }
      pg.scroll.append(box);
    }
  };

  function day(k) {
    const body = h('div', {});
    const fill = () => {
      body.innerHTML = '';
      const evs = eventsOn(k), dys = diariesOn(k);
      if (evs.length) body.append(h('div', { class: 'ev-list' }, evs.map((e) => evRow(e, k, '', () => { s.close(); edit(e); }))));
      if (dys.length) body.append(group('这天的日记', ...dys.map(({ c, d }) => h('button', { class: 'row', onclick: () => { s.close(); openApp('diary', { char: c.id }); } }, h('span', { class: 'row-l' }, D.nameOf(c), h('small', { text: d.text.slice(0, 40) + '…' }))))));
      if (!evs.length && !dys.length) body.append(h('div', { class: 'empty', text: '这天什么都没有' }));
      body.append(h('button', { class: 'btn wide', text: '在这天加日程', onclick: () => { s.close(); edit(null, k); } }));
    };
    const off = D.on('events', fill);
    const s = sheet({ title: k, body, onClose: off });
    fill();
  }

  function edit(e, date) {
    const isNew = !e;
    const v = isNew ? { id: D.uid(), date: date || ymd(), title: '', note: '', yearly: false, done: [] } : { ...e };
    const dateIn = h('input', { class: 'row-in', type: 'date', value: v.date });
    dateIn.addEventListener('change', () => { v.date = dateIn.value || v.date; });
    const s = sheet({ title: isNew ? '加日程' : '日程', body: h('div', {},
      group('', inputRow({ label: '事情', value: v.title, onchange: (x) => { v.title = x.trim(); } }),
        h('label', { class: 'row' }, h('span', { class: 'row-l', text: '日期' }), dateIn)),
      group('备注', areaRow({ value: v.note, rows: 2, onchange: (x) => { v.note = x.trim(); } })),
      h('button', { class: 'btn wide', text: '保存', onclick: () => {
        document.activeElement?.blur();
        setTimeout(() => {
          if (!v.title) { toast('写一下是什么事'); return; }
          D.setEvents([...D.events().filter((x) => x.id !== v.id), v]);
          s.close();
        }, 30);
      } })) });
  }

  const offs = [D.on('events', draw), D.on('diary', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();
  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
