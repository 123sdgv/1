// 日记：每个角色自己写的日记和心里话。隔一段时间自动写（打开时补写），也能点右上角让他现在写。
import { h, Stack, page, avatar, btnIc, menu, ask, toast, confirm, longPress, paras } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { writeDiary } from '../../core/life.js';
import { queue } from '../../core/api.js';

export function charList(stack, { title, sub, open }) {
  const pg = page({ title, big: true, left: h('span') });
  const draw = () => {
    pg.scroll.querySelectorAll('.dl-list,.empty').forEach((x) => x.remove());
    const list = D.chars();
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有角色' }), '先去「社交」里新建角色。')); return; }
    const box = h('div', { class: 'dl-list' });
    for (const c of list) box.append(h('button', { class: 'dl-it', onclick: () => open(c.id) }, avatar(c.avatar, D.nameOf(c)), h('div', {}, h('b', { text: D.nameOf(c) }), h('small', { text: sub(c) }))));
    pg.scroll.append(box);
  };
  return { pg, draw };
}

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const { pg, draw } = charList(stack, {
    title: '日记',
    sub: (c) => { const ds = D.diaries(c.id); return ds.length ? `${ds.length} 篇 · 最近 ${ds[ds.length - 1].date}` : '还没写过'; },
    open: (id) => openChar(id),
  });
  pg.el.classList.add('dy');
  const offs = [D.on('diary', draw), D.on('chars', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  function openChar(cid) {
    const c = D.charById(cid);
    if (!c) return;
    const writeBtn = btnIc('edit', () => write(), '让他现在写一篇');
    const p = page({ title: `${D.nameOf(c)}的日记`, onBack: () => stack.pop(), right: writeBtn });
    p.el.classList.add('dy');
    let writing = false;
    async function write() {
      if (writing) return;
      writing = true;
      writeBtn.classList.add('busy');
      toast('他在写了…');
      try { await queue(() => writeDiary(D.charById(cid), { force: true })); toast('写好了'); }
      catch (e) { toast(e.message); }
      finally { writing = false; writeBtn.classList.remove('busy'); }
    }
    const drawList = () => {
      p.scroll.innerHTML = '';
      const ds = [...D.diaries(cid)].reverse();
      if (!ds.length) {
        p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有日记' }), '聊过一阵以后他会自己写（打开手机时补写）。也可以点右上角让他现在写。'));
        return;
      }
      for (const d of ds) {
        const dt = new Date(d.date + 'T12:00:00');
        const el = h('article', { class: 'dy-it' },
          h('header', {}, h('b', { text: `${dt.getMonth() + 1}月${dt.getDate()}日` }), h('small', { text: `${dt.getFullYear()} · 星期${'日一二三四五六'[dt.getDay()]}` })),
          h('div', { class: 'dy-text' }, paras(d.text)),
          d.inner ? h('div', { class: 'dy-inner' }, h('small', { text: '心里话' }), paras(d.inner)) : null,
          d.keys?.length ? h('div', { class: 'dy-keys' }, d.keys.map((k) => h('span', { text: k }))) : null);
        longPress(el, () => menu([
          ['编辑日记', async () => { const v = await ask('编辑日记', d.text, '', true); if (v?.trim()) { d.text = v.trim(); D.setDiaries(cid, D.diaries(cid)); } }],
          ['编辑心里话', async () => { const v = await ask('编辑心里话', d.inner, '', true); if (v != null) { d.inner = v.trim(); D.setDiaries(cid, D.diaries(cid)); } }],
          ['编辑关键词', async () => { const v = await ask('关键词（用逗号隔开）', (d.keys || []).join('，')); if (v != null) { d.keys = v.split(/[,，、\s]+/).filter(Boolean); D.setDiaries(cid, D.diaries(cid)); } }],
          ['删除这篇', async () => { if (await confirm('删除这篇日记？', '他会忘掉这篇里写的事（备忘录里记下的还在）。', '删除', true)) D.setDiaries(cid, D.diaries(cid).filter((x) => x.id !== d.id)); }, 'danger'],
        ], d.date));
        p.scroll.append(el);
      }
    };
    const off = D.on('diary', (id) => id === cid && drawList());
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
