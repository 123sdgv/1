// 备忘录：每个角色记得的关于你的事。每次聊天都会带给他；他写日记时也会自己加、删。你可以随便改。
import { h, Stack, page, btnIc, menu, ask, toast, longPress, note } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { md } from '../../core/time.js';
import { charList } from '../diary/index.js';

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const { pg, draw } = charList(stack, {
    title: '备忘录',
    sub: (c) => { const n = D.memos(c.id).length; return n ? `记得 ${n} 件事` : '还什么都不记得'; },
    open: (id) => openChar(id),
  });
  pg.el.classList.add('mm');
  const offs = [D.on('memo', draw), D.on('chars', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  function openChar(cid) {
    const c = D.charById(cid);
    if (!c) return;
    const p = page({ title: D.nameOf(c), onBack: () => stack.pop(), right: btnIc('plus', () => add(), '记一条') });
    p.el.classList.add('mm');
    async function add() {
      const v = await ask(`让${D.nameOf(c)}记住`, '', '比如：我不吃香菜', true);
      if (v?.trim()) D.setMemos(cid, [...D.memos(cid), { id: D.uid(), text: v.trim(), ts: Date.now() }]);
    }
    const drawList = () => {
      p.scroll.innerHTML = '';
      p.scroll.append(h('div', { class: 'mm-head' }, h('b', { text: `${D.nameOf(c)}记得的关于你的事` }), h('small', { text: '每次聊天都会带给他；他写日记时也会自己加、删。点一条可以改，长按删除。' })));
      const ms = D.memos(cid);
      if (!ms.length) { p.scroll.append(h('div', { class: 'empty', text: '还没有。聊过一阵、他写日记时会自己记；也可以点右上角替他记一条。' })); return; }
      const box = h('div', { class: 'mm-list' });
      ms.forEach((m, i) => {
        const it = h('button', { class: 'mm-it', onclick: async () => {
          const v = await ask('改一下', m.text, '', true);
          if (v == null) return;
          if (!v.trim()) { D.setMemos(cid, D.memos(cid).filter((x) => x.id !== m.id)); return; }
          m.text = v.trim(); D.setMemos(cid, D.memos(cid));
        } }, h('span', { class: 'mm-n', text: i + 1 }), h('p', { text: m.text }), h('small', { text: (m.auto ? '他记的 · ' : '') + md(m.ts) }));
        longPress(it, () => menu([['删除这条', () => { D.setMemos(cid, D.memos(cid).filter((x) => x.id !== m.id)); toast('删掉了'); }, 'danger']]));
        box.append(it);
      });
      p.scroll.append(box);
    };
    const off = D.on('memo', (id) => id === cid && drawList());
    stack.push({ el: p.el, onDestroy: off });
    drawList();
  }

  const go = (a) => {
    if (!a?.char) return;
    while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); stack.top.el.style.transform = ''; }
    openChar(a.char);
  };
  go(arg);
  return { go, destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
