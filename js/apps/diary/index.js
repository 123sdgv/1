// 日记：每个角色自己写的日记和心里话。隔一段时间自动写（打开时补写），也能点右上角铅笔让他现在写（会先问一句）。
// 一页一篇，像翻书；日期在右下角，点了选一天翻过去。
// 一起读完一本书写的阅读日记也在这里（d.book 有值，右上角写着书名）。
// 改：右上角 ⭕ 点了这一页都能改（日记、心里话、关键词），变成 ✅；点 ✅ 问一句再存。改到一半要走也问一句。长按一篇 = 删除。
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

  // ── 一个人的日记：一页一篇，像翻书（往左划 = 翻到后一篇，往右划 = 翻回前一篇）。打开是最新那篇。
  // 日期在每页右下角，点了选一天，翻到那天（那天没写就翻到最近的一篇）。⭕ 改这一页；长按这一页 = 删除 ──
  function openChar(cid) {
    const c = D.charById(cid);
    if (!c) return;
    // 铅笔 = 让他现在写一篇（先问一句，免得误点花钱）。放在 ⭕ 左边，最右边那个误点了也只是进入修改
    const writeBtn = btnIc('edit', async () => {
      if (writing || ed.on) return;
      if (!(await confirm(`让${D.nameOf(c)}现在写一篇？`, '', '写'))) return;
      write();
    }, '让他现在写一篇');
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0));
    let ds = [], idx = -1, curEl = null, turning = null;
    const ed = pageEditor({
      draw: () => show(),
      empty: () => !ds[idx],
      store: () => D.setDiaries(cid, D.diaries(cid)),
      fields: () => {
        const d = ds[idx];
        if (!d || !curEl) return [];
        return [
          { el: curEl.querySelector('.dy-text'), value: d.text, apply: (v) => { if (!v) { toast('日记不能是空的'); return false; } d.text = v; } },
          { el: curEl.querySelector('.dy-inner-t'), value: d.inner || '', apply: (v) => { d.inner = v; } },
          { el: curEl.querySelector('.dy-keys'), value: (d.keys || []).join('，'), apply: (v) => { d.keys = v.split(/[,，、\s]+/).filter(Boolean); } },
        ];
      },
    });
    const p = page({ title: `${D.nameOf(c)}的日记`, onBack: () => ed.leave(() => stack.pop()), right: [btnIc('toc', () => ed.leave(() => { if (ed.on) ed.stop(); openTimeline(cid); }), '时间线'), writeBtn, ed.btn] });
    p.el.classList.add('dy', 'dy-bkpg');
    const book = h('div', { class: 'dy-bk' });
    p.scroll.append(book);
    let writing = false;
    async function write() {
      writing = true;
      writeBtn.classList.add('busy');
      toast('他在写了…');
      try { await queue(() => writeDiary(D.charById(cid), { force: true })); load(); idx = ds.length - 1; show(); toast('写好了'); }
      catch (e) { toast(e.message, 4000); }
      finally { writing = false; writeBtn.classList.remove('busy'); }
    }
    const dateText = (d) => {
      const dt = new Date(d.date + 'T12:00:00');
      return `${dt.getFullYear() !== new Date().getFullYear() ? dt.getFullYear() + '年' : ''}${dt.getMonth() + 1}月${dt.getDate()}日 星期${'日一二三四五六'[dt.getDay()]}`;
    };
    /** 一页：正文、心里话、关键词；左下角书名（阅读日记），右下角日期（点了选一天翻过去） */
    function pageOf(d, editing = false) {
      const text = editing ? h('div', { class: 'dy-text', text: d.text }) : h('div', { class: 'dy-text' }, paras(d.text));
      const innerBody = editing ? h('div', { class: 'dy-inner-t', text: d.inner || '' }) : h('div', { class: 'dy-inner-t' }, paras(d.inner || ''));
      const inner = h('div', { class: 'dy-inner', hidden: !d.inner && !editing }, h('small', { text: '心里话' }), innerBody);
      const keys = editing ? h('div', { class: 'dy-keys', text: (d.keys || []).join('，') }) : h('div', { class: 'dy-keys', hidden: !d.keys?.length }, (d.keys || []).map((k) => h('span', { text: k })));
      const pick = h('input', { class: 'dy-date-in', type: 'date', value: d.date, min: ds[0]?.date, max: ds[ds.length - 1]?.date, 'aria-label': '翻到哪天', disabled: editing });
      pick.addEventListener('change', () => { if (pick.value) jump(pick.value); });
      const date = h('label', { class: 'dy-date', onclick: () => { if (!editing) try { pick.showPicker(); } catch {} } }, h('span', { text: dateText(d) }), pick);
      const el = h('article', { class: 'dy-pg', 'data-id': d.id },
        h('div', { class: 'dy-pg-s' }, text, inner, editing ? h('small', { class: 'dy-keys-t', text: '关键词' }) : null, keys),
        h('footer', { class: 'dy-pg-f' }, d.book ? h('em', { class: 'dy-book', text: `《${D.bookById(d.book)?.title || d.bookTitle || ''}》` }) : h('span'), date),
        h('i', { class: 'dy-shade' }));
      if (!editing) longPress(el.querySelector('.dy-pg-s'), () => { if (!turning) menu([
        ['删除这篇', async () => { if (await confirm('删除这篇日记？', '', '删除', true)) D.setDiaries(cid, D.diaries(cid).filter((x) => x.id !== d.id)); }, 'danger'],
      ], dateText(d)); });
      return el;
    }
    function load() { ds = [...D.diaries(cid)].sort(byDate); }
    /** 画现在这页（不翻）。正在改的时候先不动 */
    function show() {
      if (ed.on && ed.list.length) return;
      p.el.classList.toggle('editing', ed.on);
      book.innerHTML = '';
      curEl = null;
      if (!ds.length) { book.append(h('div', { class: 'empty' }, h('b', { text: '还没有日记' }))); return; }
      idx = Math.max(0, Math.min(ds.length - 1, idx));
      curEl = pageOf(ds[idx], ed.on);
      book.append(curEl);
    }
    // ── 翻页 ──
    // 往后翻（dir 1）：这一页从右边掀起来、绕着左边的书脊转走，露出底下的下一篇；往前翻（dir -1）：前一篇从左边转回来盖上
    const setP = (t, k) => {
      const ang = t.dir > 0 ? -k * 90 : -(1 - k) * 90;
      t.flip.style.transform = `rotateY(${ang}deg)`;
      t.flip.querySelector('.dy-shade').style.opacity = (t.dir > 0 ? k : 1 - k) * 0.55;
      t.under.querySelector('.dy-shade').style.opacity = (t.dir > 0 ? 1 - k : k) * 0.3;
      t.k = k;
    };
    function begin(dir, to = idx + dir) {
      if (!ds[to] || to === idx || !curEl) return null;
      const toEl = pageOf(ds[to]);
      const t = dir > 0 ? { dir, to, toEl, under: toEl, flip: curEl } : { dir, to, toEl, under: curEl, flip: toEl };
      if (dir > 0) book.prepend(toEl); else book.append(toEl);
      t.flip.classList.add('turning');
      setP(t, 0);
      return t;
    }
    function settle(t, done) {
      const from = t.k, goal = done ? 1 : 0, ms = 120 + 260 * Math.abs(goal - from), t0 = performance.now();
      turning = t;
      const step = (now) => {
        const q = Math.min(1, (now - t0) / ms), e = 1 - (1 - q) ** 3;
        setP(t, from + (goal - from) * e);
        if (q < 1) { requestAnimationFrame(step); return; }
        if (done) { (t.dir > 0 ? t.flip : t.under).remove(); curEl = t.toEl; idx = t.to; }
        else t.toEl.remove();
        for (const x of [t.flip, t.under]) { x.classList.remove('turning'); x.style.transform = ''; x.querySelector('.dy-shade').style.opacity = ''; }
        turning = null;
      };
      requestAnimationFrame(step);
    }
    /** 翻到第 i 篇（隔着好几页也是翻一下） */
    function turnTo(i) {
      if (turning || i === idx || !ds[i]) return;
      const t = begin(i > idx ? 1 : -1, i);
      if (t) settle(t, true);
    }
    /** 点日期选了一天：翻到那天；那天没写就翻到离它最近的一篇 */
    function jump(v) {
      let i = ds.findIndex((d) => d.date === v);
      if (i < 0) {
        const day = (s) => Date.parse(s + 'T12:00:00') / 86400000;
        i = ds.reduce((best, d, k) => (Math.abs(day(d.date) - day(v)) < Math.abs(day(ds[best].date) - day(v)) ? k : best), 0);
        toast('那天没有日记');
      }
      if (i === idx) { show(); return; }
      turnTo(i);
    }
    // 手指划：横着划才翻（竖着是看长的那篇）；左边缘留给返回
    let drag = null;
    book.addEventListener('pointerdown', (e) => {
      if (ed.on || turning || !curEl || e.button > 0 || e.target.closest('.dy-date')) return;
      if (e.clientX - p.el.getBoundingClientRect().left < 26) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false, t: null, W: book.clientWidth || 1, lx: e.clientX, lt: performance.now(), vx: 0 };
    });
    book.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const mx = e.clientX - drag.x0, my = e.clientY - drag.y0;
      if (!drag.live) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { drag = null; return; }
        if (Math.abs(mx) < 10) return;
        drag.live = true;
        drag.t = begin(mx < 0 ? 1 : -1);
        try { book.setPointerCapture(e.pointerId); } catch {}
      }
      const now = performance.now();
      drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt); drag.lx = e.clientX; drag.lt = now;
      if (drag.t) setP(drag.t, Math.max(0, Math.min(1, (drag.t.dir > 0 ? -mx : mx) / (drag.W * 0.85))));
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { t, vx } = drag;
      drag = null;
      if (!t) return;
      const fling = t.dir > 0 ? vx < -0.45 : vx > 0.45;
      const back = t.dir > 0 ? vx > 0.3 : vx < -0.3;
      settle(t, !back && (t.k > 0.33 || fling));
    };
    book.addEventListener('pointerup', up);
    book.addEventListener('pointercancel', up);

    const off = D.on('diary', (id) => {
      if (id !== cid || turning) return;
      const keep = ds[idx]?.id;
      load();
      const i = ds.findIndex((d) => d.id === keep);
      if (i >= 0) idx = i;
      show();
    });
    stack.push({ el: p.el, onDestroy: off, guard: ed.guard, onBack: () => ed.leave(() => stack.pop()) });
    load();
    idx = ds.length - 1;
    show();
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
