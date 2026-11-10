// 日记：每个角色自己写的日记和心里话。隔一段时间自动写（打开时补写），也能点右上角铅笔让他现在写（会先问一句）。
// 一起读完一本书写的阅读日记也在这里（d.book 有值，右上角写着书名）。
// 改：右上角 ⭕ 点了整页都能改（日记、心里话、关键词），变成 ✅；点 ✅ 问一句再存。改到一半要走也问一句。长按一篇 = 删除。
// 右上角 ☰ 是时间线：旧日记压成的周记、月记（他聊天时靠它记得更早的事），也是 ⭕ 整页改；长按一段 = 重写。
import { h, Stack, page, avatar, btnIc, menu, toast, confirm, longPress, paras, modeBtn, askSave, askLeave, setEditable, editableText, caretEnd } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { writeDiary, writeTimeline } from '../../core/life.js';
import { queue } from '../../core/api.js';
import { rangeText, monthText } from '../../core/time.js';

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

/**
 * 整页改：⭕ → 整页能打字 → ✅ 问一句存。
 * fields() 返回这一页所有能改的块 [{ el, value, apply(新字) → false 表示不行 }]
 */
function pageEditor({ draw, fields, store, empty }) {
  const st = { on: false, list: [] };
  const btn = modeBtn(() => (st.on ? st.commit() : st.start()));
  const changed = () => st.list.some((f) => editableText(f.el) !== f.value);
  st.btn = btn;
  st.guard = () => st.on && changed();
  st.start = () => {
    if (empty()) return;
    st.on = true; btn.set(true); draw();
    st.list = fields();
    for (const f of st.list) { setEditable(f.el); f.el.classList.add('dy-edit'); }
    const first = st.list[0]?.el;
    if (first) setTimeout(() => caretEnd(first), 50);
  };
  st.stop = () => { st.on = false; st.list = []; btn.set(false); document.activeElement?.blur(); draw(); };
  st.save = () => {
    for (const f of st.list) { const v = editableText(f.el); if (v !== f.value && f.apply(v) === false) return false; }
    store();
    return true;
  };
  st.commit = async () => {
    if (!changed()) { st.stop(); return; }
    document.activeElement?.blur();
    if (!(await askSave())) return;
    if (!st.save()) return;
    toast('保存了');
    st.stop();
  };
  st.leave = async (go) => {
    if (!st.guard()) { go(); return; }
    document.activeElement?.blur();
    const r = await askLeave();
    if (r === 'save') { if (st.save()) go(); }
    else if (r === 'drop') go();
  };
  return st;
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
    // 铅笔 = 让他现在写一篇（先问一句，免得误点花钱）。放在 ⭕ 左边，最右边那个误点了也只是进入修改
    const writeBtn = btnIc('edit', async () => {
      if (writing || ed.on) return;
      if (!(await confirm(`让${D.nameOf(c)}现在写一篇？`, '', '写'))) return;
      write();
    }, '让他现在写一篇');
    let ds = [];
    const ed = pageEditor({
      draw: () => drawList(),
      empty: () => !D.diaries(cid).length,
      store: () => D.setDiaries(cid, D.diaries(cid)),
      fields: () => {
        const out = [];
        for (const d of ds) {
          const el = p.scroll.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
          if (!el) continue;
          out.push({ el: el.querySelector('.dy-text'), value: d.text, apply: (v) => { if (!v) { toast('日记不能是空的'); return false; } d.text = v; } });
          out.push({ el: el.querySelector('.dy-inner-t'), value: d.inner || '', apply: (v) => { d.inner = v; } });
          out.push({ el: el.querySelector('.dy-keys'), value: (d.keys || []).join('，'), apply: (v) => { d.keys = v.split(/[,，、\s]+/).filter(Boolean); } });
        }
        return out;
      },
    });
    const p = page({ title: `${D.nameOf(c)}的日记`, onBack: () => ed.leave(() => stack.pop()), right: [btnIc('toc', () => ed.leave(() => { if (ed.on) ed.stop(); openTimeline(cid); }), '时间线'), writeBtn, ed.btn] });
    p.el.classList.add('dy');
    let writing = false;
    async function write() {
      writing = true;
      writeBtn.classList.add('busy');
      toast('他在写了…');
      try { await queue(() => writeDiary(D.charById(cid), { force: true })); toast('写好了'); }
      catch (e) { toast(e.message); }
      finally { writing = false; writeBtn.classList.remove('busy'); }
    }
    const drawList = () => {
      if (ed.on && ed.list.length) return; // 正在改：先不动，改完再画
      p.scroll.innerHTML = '';
      ds = [...D.diaries(cid)].reverse();
      p.el.classList.toggle('editing', ed.on);
      if (!ds.length) { p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有日记' }))); return; }
      for (const d of ds) {
        const dt = new Date(d.date + 'T12:00:00');
        // 改的时候：心里话、关键词就算是空的也露出来，能填
        const text = ed.on ? h('div', { class: 'dy-text', text: d.text }) : h('div', { class: 'dy-text' }, paras(d.text));
        const innerBody = ed.on ? h('div', { class: 'dy-inner-t', text: d.inner || '' }) : h('div', { class: 'dy-inner-t' }, paras(d.inner || ''));
        const inner = h('div', { class: 'dy-inner', hidden: !d.inner && !ed.on }, h('small', { text: '心里话' }), innerBody);
        const keys = ed.on ? h('div', { class: 'dy-keys', text: (d.keys || []).join('，') }) : h('div', { class: 'dy-keys', hidden: !d.keys?.length }, (d.keys || []).map((k) => h('span', { text: k })));
        const el = h('article', { class: 'dy-it', 'data-id': d.id },
          h('header', {}, h('b', { text: `${dt.getMonth() + 1}月${dt.getDate()}日` }), h('small', { text: `${dt.getFullYear()} · 星期${'日一二三四五六'[dt.getDay()]}` }),
            d.book ? h('em', { class: 'dy-book', text: `《${D.bookById(d.book)?.title || d.bookTitle || ''}》` }) : null),
          text, inner, ed.on ? h('small', { class: 'dy-keys-t', text: '关键词' }) : null, keys);
        if (!ed.on) longPress(el, () => menu([
          ['删除这篇', async () => { if (await confirm('删除这篇日记？', '', '删除', true)) D.setDiaries(cid, D.diaries(cid).filter((x) => x.id !== d.id)); }, 'danger'],
        ], d.date));
        p.scroll.append(el);
      }
    };
    const off = D.on('diary', (id) => id === cid && drawList());
    stack.push({ el: p.el, onDestroy: off, guard: ed.guard, onBack: () => ed.leave(() => stack.pop()) });
    drawList();
  }

  // ── 时间线：月记、周记，新的在上面。铅笔 = 现在整理（先问一句；还没过完的这一周也先写一段）；⭕ 整页改；长按一段 = 重写 ──
  function openTimeline(cid) {
    const c = D.charById(cid);
    if (!c) return;
    const goBtn = btnIc('edit', async () => {
      if (busy || ed.on) return;
      if (!(await confirm('让他现在整理时间线？', '', '整理'))) return;
      organize();
    }, '现在整理');
    let list = [];
    const ed = pageEditor({
      draw: () => drawList(),
      empty: () => !D.timeline(cid).length,
      store: () => D.setTimeline(cid, D.timeline(cid)),
      fields: () => {
        const out = [];
        for (const t of list) {
          const el = p.scroll.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
          if (!el) continue;
          out.push({ el: el.querySelector('.dy-text'), value: t.text, apply: (v) => { if (!v) { toast('不能是空的'); return false; } t.text = v; } });
          out.push({ el: el.querySelector('.dy-keys'), value: (t.keys || []).join('，'), apply: (v) => { t.keys = v.split(/[,，、\s]+/).filter(Boolean); } });
        }
        return out;
      },
    });
    const p = page({ title: `${D.nameOf(c)}的时间线`, onBack: () => ed.leave(() => stack.pop()), right: [goBtn, ed.btn] });
    p.el.classList.add('dy');
    let busy = false;
    async function organize() {
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
    const drawList = () => {
      if (ed.on && ed.list.length) return;
      p.scroll.innerHTML = '';
      p.el.classList.toggle('editing', ed.on);
      list = [...D.timeline(cid)].sort((a, b) => (a.to !== b.to ? (a.to < b.to ? 1 : -1) : a.kind === 'month' ? -1 : 1));
      if (!list.length) { p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有' }))); return; }
      for (const t of list) {
        const text = ed.on ? h('div', { class: 'dy-text', text: t.text }) : h('div', { class: 'dy-text' }, paras(t.text));
        const keys = ed.on ? h('div', { class: 'dy-keys', text: (t.keys || []).join('，') }) : t.keys?.length ? h('div', { class: 'dy-keys' }, t.keys.map((k) => h('span', { text: k }))) : null;
        const el = h('article', { class: 'dy-it tl-it ' + t.kind, 'data-id': t.id },
          h('header', {}, h('b', { text: t.kind === 'month' ? monthText(t.from.slice(0, 7)) : rangeText(t.from, t.to) }), h('small', { text: t.kind === 'month' ? '月记' : '周记' })),
          text, ed.on ? h('small', { class: 'dy-keys-t', text: '关键词' }) : null, keys);
        if (!ed.on) longPress(el, () => { if (busy) return; menu([
          ['重写这段', () => { D.setTimeline(cid, D.timeline(cid).filter((x) => x.id !== t.id)); organize(); }],
        ], t.kind === 'month' ? monthText(t.from.slice(0, 7)) : rangeText(t.from, t.to)); });
        p.scroll.append(el);
      }
    };
    const off = D.on('timeline', (id) => id === cid && drawList());
    stack.push({ el: p.el, onDestroy: off, guard: ed.guard, onBack: () => ed.leave(() => stack.pop()) });
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
