// 日历：你的日程和纪念日（整台手机共用）。角色能看到未来 7 天的，到日子会提。有日记的日子也标出来。
import { h, Stack, page, btnIc, sheet, group, inputRow, toggleRow, areaRow, toast, menu, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { ymd } from '../../core/time.js';
import { openApp } from '../../phone/window.js';

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function eventsOn(date) {
  return D.events().filter((e) => (e.yearly ? e.date.slice(5) === date.slice(5) && e.date <= date : e.date === date));
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
    pg.scroll.append(head, grid, h('div', { class: 'cal-legend' }, h('span', {}, h('i', { class: 'e' }), '日程'), h('span', {}, h('i', { class: 'd' }), '有日记')));
    // 接下来的日程
    const soon = [];
    for (const e of D.events()) {
      let date = e.date;
      if (e.yearly) { const yy = new Date().getFullYear(); date = `${yy}${e.date.slice(4)}`; if (date < today) date = `${yy + 1}${e.date.slice(4)}`; }
      if (date >= today) soon.push({ e, date });
    }
    soon.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (soon.length) {
      pg.scroll.append(h('div', { class: 'cal-soon-t', text: '接下来' }));
      for (const { e, date } of soon.slice(0, 20)) {
        const n = Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        pg.scroll.append(h('button', { class: 'cal-ev', onclick: () => edit(e) },
          h('div', { class: 'cal-ev-d' }, h('b', { text: n === 0 ? '今天' : n }), n ? h('small', { text: '天后' }) : null),
          h('div', {}, h('b', { text: e.title }), h('small', { text: `${date}${e.yearly ? ' · 每年' : ''}${e.note ? ' · ' + e.note : ''}` }))));
      }
    }
  };

  function day(k) {
    const evs = eventsOn(k), dys = diariesOn(k);
    const body = h('div', {});
    const s = sheet({ title: k, body });
    if (evs.length) body.append(group('日程', ...evs.map((e) => h('button', { class: 'row', onclick: () => { s.close(); edit(e); } }, h('span', { class: 'row-l' }, e.title, e.note ? h('small', { text: e.note }) : null), h('span', { class: 'row-v', text: e.yearly ? '每年' : '' })))));
    if (dys.length) body.append(group('这天的日记', ...dys.map(({ c, d }) => h('button', { class: 'row', onclick: () => { s.close(); openApp('diary', { char: c.id }); } }, h('span', { class: 'row-l' }, D.nameOf(c), h('small', { text: d.text.slice(0, 40) + '…' }))))));
    if (!evs.length && !dys.length) body.append(h('div', { class: 'empty', text: '这天什么都没有' }));
    body.append(h('button', { class: 'btn wide', text: '在这天加日程', onclick: () => { s.close(); edit(null, k); } }));
  }

  function edit(e, date) {
    const isNew = !e;
    const v = isNew ? { id: D.uid(), date: date || ymd(), title: '', note: '', yearly: false } : { ...e };
    const dateIn = h('input', { class: 'row-in', type: 'date', value: v.date });
    dateIn.addEventListener('change', () => { v.date = dateIn.value || v.date; });
    const s = sheet({ title: isNew ? '加日程' : '日程', body: h('div', {},
      group('', inputRow({ label: '事情', value: v.title, placeholder: '比如：考试、他的生日', onchange: (x) => { v.title = x.trim(); } }),
        h('label', { class: 'row' }, h('span', { class: 'row-l', text: '日期' }), dateIn),
        toggleRow({ label: '每年都有', sub: '生日、纪念日', value: v.yearly, onchange: (x) => { v.yearly = x; } })),
      group('备注', areaRow({ value: v.note, rows: 2, placeholder: '可以不写', onchange: (x) => { v.note = x.trim(); } })),
      h('button', { class: 'btn wide', text: '保存', onclick: () => {
        document.activeElement?.blur();
        setTimeout(() => {
          if (!v.title) { toast('写一下是什么事'); return; }
          D.setEvents([...D.events().filter((x) => x.id !== v.id), v]);
          s.close();
        }, 30);
      } }),
      !isNew ? h('button', { class: 'btn wide ghost danger-t', text: '删除', onclick: async () => { if (await confirm('删除这个日程？', '', '删除', true)) { D.setEvents(D.events().filter((x) => x.id !== v.id)); s.close(); } } }) : null) });
  }

  const offs = [D.on('events', draw), D.on('diary', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();
  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
