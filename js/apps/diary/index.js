// 日记：每个角色自己写的日记和心里话。隔一段时间自动写（打开时补写），也能点右上角让他现在写。
// 一起读完一本书写的阅读日记也在这里（d.book 有值，右上角写着书名）。
// 编辑都是在原文上直接改（不弹框）。右上角另一个按钮是时间线：旧日记压成的周记、月记（他聊天时靠它记得更早的事）。
import { h, Stack, page, avatar, btnIc, icon, menu, toast, confirm, longPress, paras } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { writeDiary, writeTimeline } from '../../core/life.js';
import { queue } from '../../core/api.js';
import { rangeText, monthText } from '../../core/time.js';

/**
 * 原地编辑：一页用一个。editIn(那一块, 原来的字, 存(新的字), { oneLine }) 把那一块变成能打字的，下面冒出 × ✓。
 * 正在改的时候 redraw 先不动（stale），改完再画。
 */
function inlineEditor(redraw) {
  const st = { editing: false, stale: false };
  st.editIn = (block, value, save, { oneLine = false } = {}) => {
    if (st.editing) return;
    st.editing = true;
    block.classList.add('dy-edit');
    block.textContent = value;
    block.setAttribute('contenteditable', 'plaintext-only');
    if (block.contentEditable !== 'plaintext-only') block.setAttribute('contenteditable', 'true');
    block.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || ''); });
    if (oneLine) block.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } });
    const done = (ok) => {
      const v = block.innerText.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (ok && save(v) === false) return;
      st.editing = false; st.stale = false;
      document.activeElement?.blur();
      redraw();
    };
    const bar = h('div', { class: 'os-ed-bar dy-ed-bar' },
      h('button', { 'aria-label': '不改了', html: icon('close'), onclick: () => done(false) }),
      h('button', { class: 'ok', 'aria-label': '改好了', html: icon('check'), onclick: () => done(true) }));
    for (const b of bar.children) b.addEventListener('pointerdown', (e) => e.preventDefault()); // 点按钮不先收键盘
    block.after(bar);
    block.focus();
    const sel = getSelection(), rg = document.createRange();
    rg.selectNodeContents(block); rg.collapse(false);
    sel.removeAllRanges(); sel.addRange(rg);
    setTimeout(() => bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
  };
  return st;
}

export function charList(stack, { title, sub, open }) {
  const pg = page({ title, big: true, left: h('span') });
  const draw = () => {
    pg.scroll.querySelectorAll('.dl-list,.empty').forEach((x) => x.remove());
    const list = D.chars();
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有角色' }))); return; }
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
    sub: (c) => { const ds = D.diaries(c.id); return ds.length ? `${ds.length} 篇 · 最近 ${ds[ds.length - 1].date}` : ''; },
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
    const p = page({ title: `${D.nameOf(c)}的日记`, onBack: () => stack.pop(), right: [btnIc('toc', () => openTimeline(cid), '时间线'), writeBtn] });
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
    const ed = inlineEditor(() => drawList());
    const drawList = () => {
      if (ed.editing) { ed.stale = true; return; }
      p.scroll.innerHTML = '';
      const ds = [...D.diaries(cid)].reverse();
      if (!ds.length) {
        p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有日记' })));
        return;
      }
      for (const d of ds) {
        const dt = new Date(d.date + 'T12:00:00');
        const text = h('div', { class: 'dy-text' }, paras(d.text));
        const innerBody = h('div', { class: 'dy-inner-t' }, paras(d.inner || ''));
        const inner = h('div', { class: 'dy-inner', hidden: !d.inner }, h('small', { text: '心里话' }), innerBody);
        const keys = h('div', { class: 'dy-keys', hidden: !d.keys?.length }, (d.keys || []).map((k) => h('span', { text: k })));
        const el = h('article', { class: 'dy-it' },
          h('header', {}, h('b', { text: `${dt.getMonth() + 1}月${dt.getDate()}日` }), h('small', { text: `${dt.getFullYear()} · 星期${'日一二三四五六'[dt.getDay()]}` }),
            d.book ? h('em', { class: 'dy-book', text: `《${D.bookById(d.book)?.title || d.bookTitle || ''}》` }) : null),
          text, inner, keys);
        const save = () => D.setDiaries(cid, D.diaries(cid));
        longPress(el, () => { if (ed.editing) return; menu([
          ['编辑日记', () => ed.editIn(text, d.text, (v) => { if (!v) { toast('不能是空的'); return false; } d.text = v; save(); })],
          ['编辑心里话', () => { inner.hidden = false; ed.editIn(innerBody, d.inner || '', (v) => { d.inner = v; save(); }); }],
          ['编辑关键词', () => { keys.hidden = false; ed.editIn(keys, (d.keys || []).join('，'), (v) => { d.keys = v.split(/[,，、\s]+/).filter(Boolean); save(); }, { oneLine: true }); }],
          ['删除这篇', async () => { if (await confirm('删除这篇日记？', '', '删除', true)) D.setDiaries(cid, D.diaries(cid).filter((x) => x.id !== d.id)); }, 'danger'],
        ], d.date); });
        p.scroll.append(el);
      }
    };
    const off = D.on('diary', (id) => id === cid && drawList());
    stack.push({ el: p.el, onDestroy: off });
    drawList();
  }

  // ── 时间线：月记、周记，新的在上面。右上角 = 现在整理（还没过完的这一周也先写一段）；长按一段：编辑（原地改）、重写 ──
  function openTimeline(cid) {
    const c = D.charById(cid);
    if (!c) return;
    const goBtn = btnIc('edit', () => organize(), '现在整理');
    const p = page({ title: `${D.nameOf(c)}的时间线`, onBack: () => stack.pop(), right: goBtn });
    p.el.classList.add('dy');
    let busy = false;
    async function organize() {
      if (busy) return;
      busy = true;
      goBtn.classList.add('busy');
      toast('他在整理了…');
      try {
        let n = 0;
        while (n < 8 && (await queue(() => writeTimeline(D.charById(cid), { now: true })))) n++;
        toast(n ? '整理好了' : '没有要整理的');
      } catch (e) { toast(e.message); }
      finally { busy = false; goBtn.classList.remove('busy'); }
    }
    const ed = inlineEditor(() => drawList());
    const drawList = () => {
      if (ed.editing) { ed.stale = true; return; }
      p.scroll.innerHTML = '';
      const list = [...D.timeline(cid)].sort((a, b) => (a.to !== b.to ? (a.to < b.to ? 1 : -1) : a.kind === 'month' ? -1 : 1));
      if (!list.length) { p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有' }))); return; }
      for (const t of list) {
        const text = h('div', { class: 'dy-text' }, paras(t.text));
        const el = h('article', { class: 'dy-it tl-it ' + t.kind },
          h('header', {}, h('b', { text: t.kind === 'month' ? monthText(t.from.slice(0, 7)) : rangeText(t.from, t.to) }), h('small', { text: t.kind === 'month' ? '月记' : '周记' })),
          text,
          t.keys?.length ? h('div', { class: 'dy-keys' }, t.keys.map((k) => h('span', { text: k }))) : null);
        longPress(el, () => { if (ed.editing || busy) return; menu([
          ['编辑', () => ed.editIn(text, t.text, (v) => { if (!v) { toast('不能是空的'); return false; } t.text = v; D.setTimeline(cid, D.timeline(cid)); })],
          ['重写这段', () => { D.setTimeline(cid, D.timeline(cid).filter((x) => x.id !== t.id)); organize(); }],
        ], t.kind === 'month' ? monthText(t.from.slice(0, 7)) : rangeText(t.from, t.to)); });
        p.scroll.append(el);
      }
    };
    const off = D.on('timeline', (id) => id === cid && drawList());
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
