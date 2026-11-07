// 消息列表：这个身份下的每个角色一行，按最后一条消息排，置顶的在前
import { h, avatar, menu, confirm, longPress } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { short } from '../../core/time.js';
import { partPreview } from '../../core/parse.js';
import { busy } from '../../core/chat.js';
import { openChat } from './chat.js';
import { editChar } from './char.js';

function preview(c) {
  const list = D.msgs(c.id);
  for (let i = list.length - 1; i >= 0; i--) {
    const ps = D.partsOf(list[i]);
    if (!ps.length) continue;
    const p = ps[ps.length - 1];
    return { text: (list[i].role === 'me' && p.t !== 'note' ? '' : '') + partPreview(p), ts: list[i].ts };
  }
  return { text: c.sign || '还没有聊过', ts: 0 };
}

export function listPane(ctx) {
  const el = h('div', { class: 'so-pane scroll' });
  const draw = () => {
    el.innerHTML = '';
    const rows = D.chars().map((c) => ({ c, m: D.meta(c.id), p: preview(c) }));
    rows.sort((a, b) => (b.m.pinned - a.m.pinned) || ((b.p.ts || b.c.createdAt) - (a.p.ts || a.c.createdAt)));
    if (!rows.length) {
      el.append(h('div', { class: 'empty' }, h('b', { text: '还没有角色' }), '点右上角的 ＋ 新建一个，写好他的样子就能开始聊了。'),
        h('button', { class: 'btn wide', text: '新建角色', onclick: () => editChar(ctx, null) }));
      return;
    }
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
        ['资料', () => editChar(ctx, c.id)],
        ['清空聊天记录', async () => { if (await confirm('清空聊天记录？', `和 ${D.nameOf(c)} 的聊天记录会全部删掉，日记和备忘录不受影响。`, '清空', true)) D.setMsgs(c.id, []); }, 'danger'],
      ], D.nameOf(c)));
      el.append(row);
    }
  };
  draw();
  const offs = ['msgs', 'meta', 'chars', 'typing'].map((ev) => D.on(ev, draw));
  return { el, onShow: draw, destroy: () => offs.forEach((f) => f()) };
}
