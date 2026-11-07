// 消息列表：最上面是搜索框（搜聊天记录），下面这个身份下的每个角色一行，按最后一条消息排，置顶的在前
import { h, avatar, menu, confirm, longPress, icon } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { short } from '../../core/time.js';
import { partPreview, partSearchText } from '../../core/parse.js';
import { busy } from '../../core/chat.js';
import { openChat } from './chat.js';

function preview(c) {
  const list = D.msgs(c.id);
  for (let i = list.length - 1; i >= 0; i--) {
    const ps = D.partsOf(list[i]);
    if (!ps.length) continue;
    return { text: partPreview(ps[ps.length - 1]), ts: list[i].ts };
  }
  return { text: '', ts: 0 };
}

/** 搜聊天记录：关键词（空格隔开的都要有），返回 [{ c, r, p, text }]，新的在前 */
function search(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const c of D.chars()) {
    for (const r of D.msgs(c.id)) {
      if (r.role === 'note') continue;
      for (const p of D.partsOf(r)) {
        const t = partSearchText(p);
        const low = t.toLowerCase();
        if (words.every((w) => low.includes(w))) out.push({ c, r, p, text: t });
      }
    }
  }
  return out.sort((a, b) => b.r.ts - a.r.ts).slice(0, 200);
}
// 命中的那段：关键词前后各留一点，关键词加粗
function snippet(text, q) {
  const w = q.toLowerCase().split(/\s+/).filter(Boolean)[0] || '';
  const i = text.toLowerCase().indexOf(w);
  const from = Math.max(0, i - 12);
  const s = (from ? '…' : '') + text.slice(from);
  const el = h('span', { class: 'sr-sub' });
  const j = s.toLowerCase().indexOf(w);
  if (j < 0 || !w) { el.textContent = s; return el; }
  el.append(s.slice(0, j), h('mark', { text: s.slice(j, j + w.length) }), s.slice(j + w.length));
  return el;
}

export function listPane(ctx) {
  const el = h('div', { class: 'so-pane scroll' });
  let q = '';
  const inp = h('input', { class: 'sr-in', type: 'search', enterkeyhint: 'search', autocomplete: 'off', 'aria-label': '搜索聊天记录' });
  const clr = h('button', { class: 'sr-x', 'aria-label': '清空', html: icon('close'), hidden: true, onclick: () => { inp.value = ''; q = ''; clr.hidden = true; draw(); } });
  const box = h('label', { class: 'sr-box' }, h('span', { class: 'sr-ic', html: icon('search') }), inp, clr);
  const body = h('div');
  el.append(h('div', { class: 'sr-wrap' }, box), body);
  let t = 0;
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = inp.value.trim(); clr.hidden = !inp.value; draw(); }, 160); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });

  const draw = () => {
    body.innerHTML = '';
    if (q) { drawResults(); return; }
    const rows = D.chars().map((c) => ({ c, m: D.meta(c.id), p: preview(c) }));
    rows.sort((a, b) => (b.m.pinned - a.m.pinned) || ((b.p.ts || b.c.createdAt) - (a.p.ts || a.c.createdAt)));
    if (!rows.length) { body.append(h('div', { class: 'empty' }, h('b', { text: '还没有角色' }))); return; }
    for (const { c, m, p } of rows) {
      const typing = busy(c.id);
      const row = h('button', { class: 'cl-row' + (m.pinned ? ' pinned' : ''), onclick: () => openChat(ctx, c.id) },
        h('span', { class: 'cl-av' }, avatar(c.avatar, D.nameOf(c)), m.unread ? h('i', { class: 'badge', text: m.unread > 99 ? '99+' : m.unread }) : null),
        h('span', { class: 'cl-mid' },
          h('span', { class: 'cl-top' }, h('b', { text: D.nameOf(c) }), h('small', { text: p.ts ? short(p.ts) : '' })),
          h('span', { class: 'cl-sub' + (typing ? ' typing' : ''), text: typing ? '对方正在输入…' : p.text })));
      longPress(row, () => menu([
        [m.pinned ? '取消置顶' : '置顶', () => D.setMeta(c.id, { pinned: !m.pinned })],
        [m.unread ? '标为已读' : '标为未读', () => D.setMeta(c.id, { unread: m.unread ? 0 : 1 })],
        ['清空聊天记录', async () => { if (await confirm('清空聊天记录？', `和 ${D.nameOf(c)} 的聊天记录会全部删掉，日记和备忘录不受影响。`, '清空', true)) D.setMsgs(c.id, []); }, 'danger'],
      ], D.nameOf(c)));
      body.append(row);
    }
  };
  function drawResults() {
    const res = search(q);
    if (!res.length) { body.append(h('div', { class: 'empty', text: '没有找到' })); return; }
    for (const { c, r, text } of res) {
      const who = r.role === 'me' ? (D.curAccount().name || '我') : D.nameOf(c);
      body.append(h('button', { class: 'cl-row sr-row', onclick: () => { inp.blur(); openChat(ctx, c.id, { at: r.id }); } },
        h('span', { class: 'cl-av' }, avatar(c.avatar, D.nameOf(c))),
        h('span', { class: 'cl-mid' },
          h('span', { class: 'cl-top' }, h('b', { text: D.nameOf(c) }), h('small', { text: short(r.ts) })),
          h('span', { class: 'cl-sub' }, r.role === 'me' ? who + '：' : '', snippet(text, q)))));
    }
  }
  draw();
  const offs = ['msgs', 'meta', 'chars', 'typing'].map((ev) => D.on(ev, () => { if (!q) draw(); }));
  return { el, onShow: () => { if (!q) draw(); }, destroy: () => offs.forEach((f) => f()) };
}
