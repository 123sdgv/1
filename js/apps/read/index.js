// 阅读：书架 → 一本书（目录、一起读的人、完结）→ 读。
// 读的页面学网文 App：大字、首行缩进、段尾一个小气泡写着几条段评，点开从下面冒出半屏的段评；背景能换图、调大小模糊和淡、调字号。
// 一次上传一章（一段文字一章，也能从 .txt 导进来）。长按一段写段评。
// 一起读：在聊天里点加号把书发给角色，他就跟着你一章一章读（core/read.js）。这里只看：谁在读、读到哪、他的读书笔记。
import { h, Stack, page, avatar, icon, btnIc, toast, confirm, ask, longPress, autosize, sheet, popbar, group, row, toggleRow, slideRow, pickImage, paras } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as R from '../../core/read.js';
import { hm, ago } from '../../core/time.js';
import { bookCover } from '../shared.js';
import { openApp } from '../../phone/window.js';

const meName = () => D.curAccount().name || '我';
const whoOf = (w) => (w === 'me' ? { name: meName(), avatar: D.curAccount().avatar } : (() => { const c = D.charById(w); return { name: c ? D.nameOf(c) : '读者', avatar: c?.avatar }; })());
const chName = (ch, i) => ch.title || `第 ${i + 1} 章`;
const wordsOf = (chs) => chs.reduce((n, ch) => n + ch.paras.reduce((m, p) => m + p.text.length, 0), 0);
const wan = (n) => (n >= 10000 ? (Math.round(n / 1000) / 10) + ' 万字' : n + ' 字');
const posIdx = (b) => { const i = D.chapters(b.id).findIndex((x) => x.id === b.pos?.ch); return i; };

// 段尾的小气泡：几条段评。fresh = 有他新写的、你还没点开看（黑的）
function bubbleSvg(n, fresh) {
  const t = n > 99 ? '99+' : String(n);
  const w = 22 + Math.max(0, t.length - 1) * 6;
  return `<svg viewBox="0 0 ${w} 20" width="${w}" height="20" aria-hidden="true"><path d="M5 1.2h${w - 10}a3.8 3.8 0 0 1 3.8 3.8v5.6a3.8 3.8 0 0 1-3.8 3.8H11l-4.4 3.8v-3.8H5A3.8 3.8 0 0 1 1.2 10.6V5A3.8 3.8 0 0 1 5 1.2z" fill="${fresh ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><text x="${w / 2}" y="11.4" text-anchor="middle" font-size="9.5" font-weight="600" font-family="-apple-system,'PingFang SC',sans-serif" fill="${fresh ? '#fff' : 'currentColor'}">${t}</text></svg>`;
}

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);

  // ── 书架 ──
  const pg = page({ title: '书架', big: true, left: h('span'), right: btnIc('plus', () => newBook(), '新书') });
  pg.el.classList.add('rd-shelf');
  const drawShelf = () => {
    pg.scroll.querySelectorAll('.bs-grid,.empty').forEach((x) => x.remove());
    const list = D.booksOf();
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有书' }))); return; }
    const grid = h('div', { class: 'bs-grid' });
    for (const b of list) {
      const n = D.chapters(b.id).length, i = posIdx(b);
      const who = Object.keys(D.readers(b.id)).map((id) => D.charById(id)).filter(Boolean).slice(0, 3);
      const cv = bookCover(b.title, '', { kids: who.length ? h('span', { class: 'bk-cv-rd' }, who.map((c) => avatar(c.avatar, D.nameOf(c), 'xs'))) : null });
      const it = h('button', { class: 'bs-it', onclick: () => openBook(b.id) }, cv, h('b', { text: b.title }),
        h('small', { text: n ? (i >= 0 ? `${i + 1} / ${n} 章` : `${n} 章`) + (b.done ? ' · 完结' : '') : '' }));
      longPress(it, (e) => popbar(cv, [
        ['edit', async () => { const t = await ask('书名', b.title); if (t?.trim()) D.saveBook({ ...D.bookById(b.id), title: t.trim() }); }, '改书名'],
        ['trash', async () => { if (await confirm(`删除《${b.title}》？`, '章节和段评都会删掉。', '删除', true)) D.removeBook(b.id); }, '删除'],
      ], { x: e.clientX, y: e.clientY }));
      grid.append(it);
    }
    pg.scroll.append(grid);
  };
  async function newBook() {
    const t = await ask('书名');
    if (!t?.trim()) return;
    const b = D.saveBook({ id: D.uid(), acc: D.curAccount().id, title: t.trim(), done: false, reach: 0, pos: null, createdAt: Date.now(), lastTs: Date.now() });
    openBook(b.id);
  }
  const offs = [D.on('books', drawShelf), D.on('account', drawShelf), D.on('bookrd', drawShelf), D.on('bookch', drawShelf)];
  stack.root({ el: pg.el, onShow: drawShelf });
  drawShelf();

  // ── 一本书：封面、开始读、一起读的人、完结、目录 ──
  function openBook(bid) {
    const p = page({ title: '', onBack: () => stack.pop(), right: btnIc('plus', () => editChapter(bid, null), '加一章') });
    p.el.classList.add('bk-pg');
    const draw = () => {
      const b = D.bookById(bid);
      if (!b) return;
      p.setTitle(b.title);
      const chs = D.chapters(bid), i = posIdx(b);
      const top = p.scroll.scrollTop;
      p.scroll.innerHTML = '';
      p.scroll.append(h('div', { class: 'bk-head' }, bookCover(b.title, 'big'),
        h('div', { class: 'bk-info' }, h('h2', { text: b.title }),
          h('small', { text: chs.length ? `${chs.length} 章 · ${wan(wordsOf(chs))}` : '' }),
          chs.length ? h('button', { class: 'btn bk-go', text: i >= 0 ? `继续读 · 第 ${i + 1} 章` : '开始读', onclick: () => openReader(bid) }) : null)));
      const rd = D.readers(bid), ids = Object.keys(rd).filter((id) => D.charById(id));
      if (ids.length) {
        const nw = R.readingNow();
        p.scroll.append(h('div', { class: 'bk-rd' }, ids.map((cid) => {
          const c = D.charById(cid), r = rd[cid];
          const busy = nw?.book === bid && nw.who === cid;
          const st = r.review ? '读完了' : busy ? '' : `${(r.read || []).length} / ${chs.length}`;
          return h('button', { class: 'bk-rd-it', onclick: () => readerSheet(bid, cid) }, avatar(c.avatar, D.nameOf(c), 'sm' + (busy ? ' now' : '')),
            busy ? h('span', { class: 'dots3' }, h('i'), h('i'), h('i')) : h('small', { text: st }));
        })));
      }
      p.scroll.append(group('', toggleRow({ label: '完结', value: b.done, onchange: (v) => { D.saveBook({ ...D.bookById(bid), done: v }); if (v) R.kick(); } })));
      if (!chs.length) p.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有章节' })));
      else {
        const counts = {};
        for (const x of D.bookCmts(bid)) counts[x.ch] = (counts[x.ch] || 0) + 1;
        p.scroll.append(h('div', { class: 'toc' }, chs.map((ch, k) => {
          const it = h('button', { class: 'toc-it' + (k === i ? ' cur' : ''), onclick: () => openReader(bid, { ch: ch.id }) },
            h('em', { text: k + 1 }), h('span', { text: chName(ch, k) }),
            counts[ch.id] ? h('small', {}, h('span', { html: icon('comment') }), String(counts[ch.id])) : null);
          longPress(it, (e) => popbar(it, [
            ['edit', () => editChapter(bid, ch.id), '改这一章'],
            ['trash', async () => { if (await confirm(`删除${chName(ch, k)}？`, '这一章的段评也会删掉。', '删除', true)) R.removeChapter(bid, ch.id); }, '删除'],
          ], { x: e.clientX, y: e.clientY }));
          return it;
        })));
      }
      p.scroll.scrollTop = top;
    };
    const offs2 = [D.on('books', (id) => (!id || id === bid) && draw()), D.on('bookch', (id) => id === bid && draw()), D.on('bookrd', (id) => id === bid && draw()), D.on('bookcm', (id) => id === bid && draw()), D.on('chars', draw)];
    stack.push({ el: p.el, onShow: draw, onDestroy: () => offs2.forEach((f) => f()) });
    draw();
  }

  // ── 加一章 / 改一章：章节名 + 正文（能从 .txt 导进来）──
  function editChapter(bid, chId) {
    const chs = D.chapters(bid);
    const k = chId ? chs.findIndex((x) => x.id === chId) : chs.length;
    const old = chId ? chs[k] : null;
    if (chId && !old) return;
    const save = h('button', { class: 'tbtn', text: '保存' });
    const p = page({ title: `第 ${k + 1} 章`, onBack: () => stack.pop(), right: [btnIc('fileIn', () => importTxt(), '从文件导入'), save] });
    p.el.classList.add('ce-pg');
    const tIn = h('input', { class: 'row-in ce-title', value: old?.title || '', autocomplete: 'off', spellcheck: 'false' });
    const ta = h('textarea', { class: 'row-ta ce-ta' });
    ta.value = old ? old.paras.map((x) => x.text).join('\n\n') : '';
    p.scroll.append(group('', h('label', { class: 'row' }, h('span', { class: 'row-l', text: '章节名' }), tIn)), group('正文', h('div', { class: 'row tall' }, ta)));
    autosize(ta);
    async function importTxt() {
      const inp = h('input', { type: 'file', accept: '.txt,text/plain', style: { display: 'none' } });
      document.body.append(inp);
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0];
        inp.remove();
        if (!f) return;
        const buf = await f.arrayBuffer();
        // 先当 UTF-8 读，读不通就当 GBK（很多中文 txt 是 GBK）
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('gb18030').decode(buf); }
        ta.value = text.replace(/^﻿/, '');
        if (!tIn.value.trim()) tIn.value = f.name.replace(/\.txt$/i, '');
        ta.dispatchEvent(new Event('input'));
      });
      inp.click();
    }
    save.onclick = () => {
      document.activeElement?.blur();
      setTimeout(() => {
        if (!ta.value.trim()) { toast('还没有字'); return; }
        R.saveChapter(bid, { id: chId, title: tIn.value, text: ta.value });
        stack.pop();
        toast('保存了');
      }, 30);
    };
    stack.push({ el: p.el });
    if (!old) setTimeout(() => ta.focus(), 380);
  }

  // ── 读 ──
  function openReader(bid, { ch: chId = null } = {}) {
    let b = D.bookById(bid);
    if (!b) return;
    const chs = () => D.chapters(bid);
    let idx = chs().findIndex((x) => x.id === (chId || b.pos?.ch));
    const startY = !chId && idx >= 0 ? b.pos?.y || 0 : 0;
    if (idx < 0) idx = 0;
    const ttl = h('span', { class: 'rd-bt', text: b.title });
    const p = page({ title: '', left: h('div', { class: 'rd-left' }, h('button', { class: 'bk', 'aria-label': '返回', html: icon('back'), onclick: () => stack.pop() }), ttl), right: btnIc('aa', () => setSheet(), '阅读设置') });
    p.el.classList.add('rd');
    const bg = h('div', { class: 'rd-bg' });
    p.el.prepend(bg);
    const bodyEl = h('div', { class: 'rd-body' });
    p.scroll.append(bodyEl);
    const stL = h('span'), stR = h('span');
    p.el.append(h('div', { class: 'rd-status' }, stL, stR));

    function applyConf() {
      const cf = D.readConf(), src = D.file('readBg');
      p.el.classList.toggle('has-bg', !!src);
      p.el.style.setProperty('--rbg', src ? `url("${src}")` : 'none');
      p.el.style.setProperty('--rbs', String(cf.size / 100));
      p.el.style.setProperty('--rbb', cf.blur + 'px');
      p.el.style.setProperty('--rbv', String(src ? cf.veil : 1));
      p.el.style.setProperty('--rfs', cf.font + 'px');
    }
    applyConf();

    // 段评数：每段几条、有没有他新写的
    function countsOf(ch) {
      const out = {};
      for (const x of D.bookCmts(bid)) if (x.ch === ch.id) { const o = (out[x.p] ||= { n: 0, fresh: false }); o.n++; if (x.fresh) o.fresh = true; }
      return out;
    }
    const bubble = (ch, pid, o) => (o?.n ? h('button', { class: 'rd-cm' + (o.fresh ? ' new' : ''), 'aria-label': `${o.n} 条段评`, html: bubbleSvg(o.n, o.fresh), onclick: (e) => { e.stopPropagation(); cmtSheet(ch, pid); } }) : null);
    function drawBubbles() {
      const ch = chs()[idx];
      if (!ch) return;
      const cs = countsOf(ch);
      for (const el of bodyEl.querySelectorAll('.rd-p')) {
        el.querySelector('.rd-cm')?.remove();
        const bb = bubble(ch, el.dataset.id, cs[el.dataset.id]);
        if (bb) el.append(bb);
      }
    }
    // 章名下面一排小头像：读过这章的、正在读的（一闪一闪）、还没读的（淡）
    const who = h('div', { class: 'rd-who' });
    function drawWho() {
      const ch = chs()[idx];
      who.innerHTML = '';
      if (!ch) return;
      const rd = D.readers(bid), nw = R.readingNow();
      for (const [cid, r] of Object.entries(rd)) {
        const c = D.charById(cid);
        if (!c) continue;
        const st = nw?.book === bid && nw.who === cid && nw.ch === ch.id ? 'now' : (r.read || []).includes(ch.id) ? 'read' : '';
        who.append(h('button', { class: 'rd-who-it ' + st, 'aria-label': D.nameOf(c), onclick: () => readerSheet(bid, cid) }, avatar(c.avatar, D.nameOf(c), 'xs')));
      }
    }

    function render(y = 0) {
      const list = chs(), ch = list[idx];
      bodyEl.innerHTML = '';
      if (!ch) { bodyEl.append(h('div', { class: 'empty' }, h('b', { text: '还没有章节' }))); return; }
      const cs = countsOf(ch);
      bodyEl.append(h('h2', { class: 'rd-ct', text: chName(ch, idx) }), who);
      drawWho();
      for (const para of ch.paras) {
        const el = h('p', { class: 'rd-p', 'data-id': para.id }, para.text, bubble(ch, para.id, cs[para.id]));
        longPress(el, () => cmtSheet(ch, para.id, true));
        bodyEl.append(el);
      }
      const last = idx === list.length - 1;
      if (last && D.bookById(bid)?.done) bodyEl.append(h('div', { class: 'rd-end', text: '完' }));
      bodyEl.append(h('div', { class: 'rd-nav' },
        h('button', { 'aria-label': '上一章', html: icon('left'), disabled: idx === 0 || null, onclick: () => go(idx - 1) }),
        h('button', { 'aria-label': '目录', html: icon('toc'), onclick: () => tocSheet() }),
        h('button', { 'aria-label': '下一章', html: icon('right'), disabled: last || null, onclick: () => go(idx + 1) })));
      requestAnimationFrame(() => { p.scroll.scrollTop = y * Math.max(0, p.scroll.scrollHeight - p.scroll.clientHeight); status(); });
      // 翻到这一章了：一起读的人可以读到这里
      b = D.bookById(bid);
      if (b && (b.reach || 0) < idx + 1) { D.saveBook({ ...b, reach: idx + 1, lastTs: Date.now() }); R.kick(); }
      else if (b) D.saveBook({ ...b, lastTs: Date.now() });
      D.setBookPos(bid, { ch: ch.id, y });
    }
    function go(i) { if (i < 0 || i >= chs().length) return; idx = i; render(0); }

    // 底下一行：第几章 / 一共几章 · 这章读了多少，右边是时间
    let st = 0;
    function status() {
      const n = chs().length, s = p.scroll, max = s.scrollHeight - s.clientHeight;
      const y = max > 0 ? Math.min(1, s.scrollTop / max) : 0;
      stL.textContent = n ? `${idx + 1}/${n} · ${Math.round(y * 100)}%` : '';
      stR.textContent = hm();
      return y;
    }
    p.scroll.addEventListener('scroll', () => {
      if (st) return;
      st = setTimeout(() => { st = 0; const y = status(); const ch = chs()[idx]; if (ch) D.setBookPos(bid, { ch: ch.id, y }); }, 250);
    }, { passive: true });
    const clock = setInterval(status, 30000);

    // 段评面板：从下面冒出半屏
    function cmtSheet(ch, pid, write = false) {
      const para = ch.paras.find((x) => x.id === pid);
      if (!para) return;
      let replyTo = null;
      const listEl = h('div', { class: 'cm-list' });
      const ta = h('textarea', { class: 'ch-in', rows: 1 });
      const fit = autosize(ta, 110);
      const send = h('button', { class: 'ch-send', 'aria-label': '发送', html: icon('send') });
      const aux = h('div', { class: 'ch-aux', hidden: true });
      ta.addEventListener('input', () => { send.classList.toggle('go', !!ta.value.trim()); });
      // 回车发（打中文选字的回车不算；Shift+回车换行）
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send.click(); } });
      send.addEventListener('pointerdown', (e) => e.preventDefault());
      send.onclick = () => {
        const text = ta.value.trim();
        if (!text) return;
        R.addMyComment(bid, { ch: ch.id, p: pid, to: replyTo?.id || null, text });
        ta.value = ''; fit(); send.classList.remove('go');
        setReply(null);
        requestAnimationFrame(() => { s.body.scrollTop = s.body.scrollHeight; });
      };
      function setReply(x) {
        replyTo = x;
        aux.innerHTML = '';
        aux.hidden = !x;
        if (x) { aux.append(h('span', { class: 'aux-ic', html: icon('reply') }), h('span', { class: 'aux-t', text: `${whoOf(x.who).name}：${x.text}` }), h('button', { 'aria-label': '不回了', html: icon('close'), onclick: () => setReply(null) })); ta.focus(); }
      }
      const foot = h('div', { class: 'cm-foot' }, aux, h('div', { class: 'ch-bar' }, ta, send));
      const s = sheet({ title: '段评', cls: 'half rd-cms', body: h('div', {}, h('p', { class: 'cm-q', text: para.text }), listEl), foot, onClose: () => off() });
      const head = s.box.querySelector('.sh-head b');
      function draw() {
        const all = D.bookCmts(bid).filter((x) => x.ch === ch.id && x.p === pid).sort((a, z) => a.ts - z.ts);
        head.textContent = all.length ? `${all.length} 条段评` : '段评';
        const byId = new Map(all.map((x) => [x.id, x]));
        const rootOf = (x) => { let r = x, n = 0; while (r.to && byId.get(r.to) && n++ < 50) r = byId.get(r.to); return r; };
        const kids = new Map();
        for (const x of all) if (x.to) { const r = rootOf(x); if (r !== x) { if (!kids.has(r.id)) kids.set(r.id, []); kids.get(r.id).push(x); } }
        listEl.innerHTML = '';
        for (const x of all) {
          if (x.to && rootOf(x) !== x) continue;
          listEl.append(itemEl(x, false, byId));
          for (const y of kids.get(x.id) || []) listEl.append(itemEl(y, true, byId));
        }
      }
      function itemEl(x, isRe, byId) {
        const w = whoOf(x.who), to = isRe ? byId.get(x.to) : null;
        const txt = h('p');
        // 楼里的回复：回的是楼主就不写「回复谁」，回的是楼里别人才写
        if (to?.to) txt.append(h('span', { class: 'cm-to', text: `回复 ${whoOf(to.who).name}：` }));
        txt.append(x.text);
        const el = h('div', { class: 'cm-it' + (isRe ? ' re' : '') + (x.fresh || freshAtOpen.has(x.id) ? ' fresh' : ''), onclick: () => { if (x.who !== 'me') setReply(x); } },
          avatar(w.avatar, w.name, isRe ? 'xs' : 'sm'),
          h('div', { class: 'cm-main' }, h('b', { text: w.name }), txt, h('small', { text: ago(x.ts) })));
        longPress(el, (e) => popbar(el, [
          ['edit', async () => { const v = await ask('改段评', x.text, '', true); if (v?.trim()) { D.setBookCmts(bid, D.bookCmts(bid).map((y) => (y.id === x.id ? { ...y, text: v.trim() } : y))); } }, '编辑'],
          ['trash', () => {
            // 回它的也一起删
            const all = D.bookCmts(bid), drop = new Set([x.id]);
            let more = true;
            while (more) { more = false; for (const y of all) if (y.to && drop.has(y.to) && !drop.has(y.id)) { drop.add(y.id); more = true; } }
            D.setBookCmts(bid, all.filter((y) => !drop.has(y.id)));
          }, '删除'],
        ], { x: e.clientX, y: e.clientY }));
        return el;
      }
      // 点开就算看过了：段尾的气泡不再是黑的（这次打开时新的那几条，在面板里还标着，关掉才算）
      const freshAtOpen = new Set(D.bookCmts(bid).filter((x) => x.ch === ch.id && x.p === pid && x.fresh).map((x) => x.id));
      const seen = () => { const all = D.bookCmts(bid); if (all.some((x) => x.ch === ch.id && x.p === pid && x.fresh)) D.setBookCmts(bid, all.map((x) => (x.ch === ch.id && x.p === pid && x.fresh ? { ...x, fresh: false } : x))); };
      // 这一段挪到面板上面露出来，标一下
      const pEl = bodyEl.querySelector(`.rd-p[data-id="${pid}"]`);
      if (pEl) {
        pEl.classList.add('on');
        const r = pEl.getBoundingClientRect(), sr = p.scroll.getBoundingClientRect();
        if (r.bottom > sr.top + sr.height * 0.44 || r.top < sr.top) p.scroll.scrollTo({ top: Math.max(0, pEl.offsetTop - 24), behavior: 'smooth' });
      }
      const offA = D.on('bookcm', (id) => { if (id === bid) { draw(); } });
      const off = () => { offA(); seen(); pEl?.classList.remove('on'); };
      draw();
      seen();
      if (write) setTimeout(() => ta.focus(), 360);
    }

    function tocSheet() {
      const list = h('div', { class: 'toc in-sheet' });
      const s = sheet({ title: '目录', body: list, full: chs().length > 8 });
      chs().forEach((ch, k) => list.append(h('button', { class: 'toc-it' + (k === idx ? ' cur' : ''), onclick: () => { s.close(); go(k); } }, h('em', { text: k + 1 }), h('span', { text: chName(ch, k) }))));
      requestAnimationFrame(() => list.querySelector('.cur')?.scrollIntoView({ block: 'center' }));
    }

    // 阅读设置：背景图（换、去掉）、大小、模糊、淡、字号。面板是半透明的，边调边看
    function setSheet() {
      const box = h('div', { class: 'rs' });
      const draw = () => {
        const cf = D.readConf(), src = D.file('readBg');
        box.innerHTML = '';
        box.append(h('div', { class: 'rs-bg' },
          h('button', { class: 'rs-pic' + (src ? ' on' : ''), 'aria-label': '换背景图', style: src ? { backgroundImage: `url("${src}")` } : null, html: src ? '' : icon('image'), onclick: async () => { const v = await pickImage({ max: 1400, quality: 0.85 }); if (v) { D.setFile('readBg', v); draw(); } } }),
          src ? h('button', { class: 'rs-x', 'aria-label': '去掉背景图', html: icon('trash'), onclick: () => { D.setFile('readBg', null); draw(); } }) : null));
        box.append(group('',
          src ? slideRow({ label: '大小', value: cf.size, min: 100, max: 300, step: 5, fmt: (v) => v + '%', onchange: (v) => D.setReadConf({ size: v }) }) : null,
          src ? slideRow({ label: '模糊', value: cf.blur, min: 0, max: 30, step: 1, fmt: (v) => String(v), onchange: (v) => D.setReadConf({ blur: v }) }) : null,
          src ? slideRow({ label: '淡', value: Math.round(cf.veil * 100), min: 0, max: 95, step: 1, fmt: (v) => v + '%', onchange: (v) => D.setReadConf({ veil: v / 100 }) }) : null,
          slideRow({ label: '字号', value: cf.font, min: 14, max: 30, step: 1, fmt: (v) => String(v), onchange: (v) => { const y = status(); D.setReadConf({ font: v }); requestAnimationFrame(() => { p.scroll.scrollTop = y * (p.scroll.scrollHeight - p.scroll.clientHeight); }); } })));
      };
      draw();
      sheet({ title: '', cls: 'blur-sheet rd-set', body: box });
    }

    const offs3 = [
      D.on('readConf', applyConf),
      D.on('file', (k) => k === 'readBg' && applyConf()),
      D.on('bookcm', (id) => id === bid && drawBubbles()),
      D.on('bookrd', (id) => id === bid && drawWho()),
      D.on('bookch', (id) => { if (id !== bid) return; if (idx >= chs().length) idx = Math.max(0, chs().length - 1); render(status()); }),
      D.on('books', (id) => { if (id && id !== bid) return; const x = D.bookById(bid); if (!x) return; ttl.textContent = x.title; }),
    ];
    stack.push({ el: p.el, onDestroy: () => { offs3.forEach((f) => f()); clearInterval(clock); clearTimeout(st); } });
    render(startY);
  }

  // ── 他：读到哪、读书笔记、阅读日记；不一起读了 ──
  function readerSheet(bid, cid) {
    const c = D.charById(cid), rd = D.readers(bid)[cid];
    if (!c || !rd) return;
    const chs = D.chapters(bid);
    const review = rd.review && D.diaries(cid).find((d) => d.id === rd.review);
    const notes = chs.map((ch, k) => (rd.notes?.[ch.id] ? h('div', { class: 'rn-it' }, h('b', { text: chName(ch, k) }), paras(rd.notes[ch.id])) : null)).filter(Boolean);
    const box = h('div', { class: 'rn' },
      review ? h('button', { class: 'rn-review', onclick: () => { s.close(); openApp('diary', { char: cid }); } }, h('small', { text: '阅读日记' }), paras(review.text)) : null,
      notes,
      !notes.length && !review ? h('div', { class: 'empty' }, h('b', { text: '还没有读书笔记' })) : null,
      group('', row({ label: '不一起读了', cls: 'danger center', chev: false, onclick: async () => { if (await confirm(`${D.nameOf(c)}不一起读了？`, '', '好', true)) { R.leave(bid, cid); s.close(); } } })));
    const s = sheet({ title: D.nameOf(c), body: box, full: notes.length > 1 || !!review });
  }

  const go = (a) => {
    if (!a?.book || !D.bookById(a.book)) return;
    while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); stack.top.el.style.transform = ''; }
    openBook(a.book);
    if (a.ch) setTimeout(() => openReader(a.book, { ch: a.ch }), 380);
  };
  go(arg);
  return { go, destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
