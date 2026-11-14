// 音乐：播放页（封面、两句歌词、歌名歌手、收藏 / 评论 / 转发、进度条、播放）→ 点一下封面那块 = 只看歌词（点一句跳过去）。
// 左上角 ☰ = 我的（匿名头像 + 名字）和歌单（＋ 加歌、每行收藏和推荐、长按改·删）；右上角搜索。
// 没有声音：按时间假装在放（core/music.js）。转发 = 打开填的真链接（汽水、Spotify…）。
// 推荐 = 选一个角色 → 聊天里一张歌的卡片、跳过去；他过一会儿去评论区。评论区所有人都匿名。
import { h, Stack, page, icon, ic, btnIc, toast, confirm, longPress, autosize, sheet, popbar, group, inputRow, row, textPage, pickImage, inlineEdit, inlineEditing, askLeave } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as M from '../../core/music.js';
import * as CS from '../../core/chat.js';
import { ago } from '../../core/time.js';
import { songCover, pickChar } from '../shared.js';
import { openApp } from '../../phone/window.js';

const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const durOf = (s) => s?.dur || M.durOf(s?.lines);
const isCredit = (t) => /^(作词|词|作曲|曲)\s*[:：]/.test(t || '');

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const win = body.closest('.win');
  const dark = (on) => { win?.classList.toggle('dark', on); document.body.classList.toggle('app-dark', on); };

  // 一打开停在上次那首（没有就第一首）
  const first = () => D.songById(D.musicLast()) || D.songs()[0] || null;
  if (!D.songById(M.nowPlaying().id) && first()) M.pick(first().id);
  const cur = () => D.songById(M.nowPlaying().id);

  // ── 播放页 ──
  const pg = page({ title: '', left: btnIc('toc', () => openList(), '歌单'), right: btnIc('search', () => openSearch(), '搜索'), cls: 'mu-player' });
  const bg = h('div', { class: 'mu-bg' });
  pg.el.prepend(bg);
  const coverBox = h('div', { class: 'mu-cvbox' });
  const two = h('div', { class: 'mu-two' });
  const lyr = h('div', { class: 'mu-lyr' });
  const stage = h('div', { class: 'mu-stage', onclick: (e) => { if (e.target.closest('.mu-ly')) return; setLyr(!pg.el.classList.contains('lyr')); } }, coverBox, two, lyr);
  const ttl = h('b', { class: 'mu-ttl' }), art = h('small', { class: 'mu-art' });
  const favB = btnIc('heart', () => { const s = cur(); if (s) D.saveSong({ ...s, fav: !s.fav }); }, '收藏', 'mu-act');
  const cmN = h('span', { class: 'mu-n' });
  const cmB = h('button', { class: 'ibtn mu-act mu-cmb', 'aria-label': '评论', html: icon('comment'), onclick: () => { const s = cur(); if (s) openComments(s.id); } }, cmN);
  const fwdB = btnIc('fwd', () => { const s = cur(); if (s?.link) window.open(s.link, '_blank', 'noopener'); }, '转发', 'mu-act');
  const info = h('div', { class: 'mu-info' }, h('div', { class: 'mu-tt' }, ttl, art), h('div', { class: 'mu-acts' }, favB, cmB, fwdB));
  const fill = h('i', { class: 'mu-fill' }), knob = h('i', { class: 'mu-knob' });
  const track = h('div', { class: 'mu-track' }, fill, knob);
  const tNow = h('small'), tAll = h('small');
  const bar = h('div', { class: 'mu-prog' }, track, h('div', { class: 'mu-times' }, tNow, tAll));
  const playB = h('button', { class: 'mu-play', 'aria-label': '播放', onclick: () => M.toggle() });
  pg.scroll.append(stage, info, bar, h('div', { class: 'mu-ctl' }, playB));

  // 拖进度条
  let drag = null;
  const ratioAt = (x) => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
  bar.addEventListener('pointerdown', (e) => { const s = cur(); if (!s) return; drag = { id: e.pointerId, r: ratioAt(e.clientX) }; bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); showPos(drag.r * durOf(s)); });
  bar.addEventListener('pointermove', (e) => { if (drag?.id !== e.pointerId) return; drag.r = ratioAt(e.clientX); showPos(drag.r * durOf(cur())); });
  const endDrag = (e) => { if (drag?.id !== e.pointerId) return; const s = cur(); if (s) M.seek(drag.r * durOf(s)); drag = null; bar.classList.remove('drag'); };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  function drawSong() {
    const s = cur();
    coverBox.innerHTML = '';
    coverBox.append(songCover(s || { id: '' }, 'big'));
    const src = s && D.file('song.' + s.id);
    bg.style.backgroundImage = src ? `url(${src})` : '';
    bg.classList.toggle('img', !!src);
    ttl.textContent = s ? s.title : '还没有歌';
    art.textContent = s?.artist || '';
    favB.innerHTML = icon(s?.fav ? 'heartf' : 'heart');
    favB.classList.toggle('on', !!s?.fav);
    const n = s ? D.songCmts(s.id).length : 0;
    cmN.textContent = n ? (n > 999 ? '999+' : n) : '';
    fwdB.disabled = !s?.link;
    for (const b of [favB, cmB, playB]) b.disabled = !s;
    lyr.innerHTML = '';
    (s?.lines || []).forEach((l, i) => lyr.append(h('button', { class: 'mu-ly' + (isCredit(l.text) ? ' cr' : ''), text: l.text || '　', onclick: () => { M.seek(M.timeOfLine(s, i)); if (!M.nowPlaying().playing) M.toggle(); } })));
    if (s && !s.lines?.length) lyr.append(h('div', { class: 'mu-none', text: '没有歌词' }));
    lastLine = -2;
    showPos(M.nowPlaying().pos);
  }
  let lastLine = -2, userScroll = 0;
  lyr.addEventListener('scroll', () => { if (!autoScroll) userScroll = Date.now(); }, { passive: true });
  let autoScroll = false;
  function showPos(pos) {
    const s = cur(), all = durOf(s), p = s ? Math.min(1, pos / all) : 0;
    fill.style.width = p * 100 + '%';
    knob.style.left = p * 100 + '%';
    tNow.textContent = mmss(s ? pos : 0);
    tAll.textContent = mmss(s ? all : 0);
    const playing = M.nowPlaying().playing;
    playB.innerHTML = icon(playing ? 'pause' : 'play');
    playB.setAttribute('aria-label', playing ? '暂停' : '播放');
    // 封面下面两句：现在这句（亮）+ 下一句；还没开始唱就是开头两句（一般是作词作曲）
    const ls = s?.lines || [];
    const i = M.lineAt(s, pos);
    if (i === lastLine) return;
    lastLine = i;
    const a = Math.max(0, i);
    two.innerHTML = '';
    if (ls.length) {
      two.append(h('p', { class: i >= 0 ? 'on' : '', text: ls[a]?.text || '' }), h('p', { text: ls[a + 1]?.text || '' }));
    } else if (s && (s.lyricist || s.composer)) {
      two.append(h('p', { text: s.lyricist ? '作词：' + s.lyricist : '' }), h('p', { text: s.composer ? '作曲：' + s.composer : '' }));
    }
    lyr.querySelectorAll('.mu-ly.on').forEach((x) => x.classList.remove('on'));
    const el = lyr.children[i];
    if (el) {
      el.classList.add('on');
      if (pg.el.classList.contains('lyr') && Date.now() - userScroll > 3000) {
        autoScroll = true;
        lyr.scrollTo({ top: el.offsetTop - lyr.clientHeight * 0.4, behavior: 'smooth' });
        setTimeout(() => { autoScroll = false; }, 600);
      }
    }
  }
  function setLyr(on) {
    pg.el.classList.toggle('lyr', on);
    if (on) { userScroll = 0; lastLine = -2; showPos(M.nowPlaying().pos); const el = lyr.querySelector('.mu-ly.on'); if (el) lyr.scrollTop = el.offsetTop - lyr.clientHeight * 0.4; }
  }

  const offs = [
    D.on('musicPos', () => { if (!drag) showPos(M.nowPlaying().pos); }),
    D.on('songs', () => { if (!cur() && first()) M.pick(first().id); drawSong(); }),
    D.on('songcm', (id) => { if (id === cur()?.id) drawSong(); }),
    D.on('file', (k) => { if (String(k).startsWith('song.')) drawSong(); }),
  ];
  stack.root({ el: pg.el, onShow: () => { dark(true); drawSong(); }, onHide: () => dark(false) });
  drawSong();

  // ── 我的 + 歌单 ──
  function openList() {
    const p = page({ title: '', onBack: () => stack.pop(), cls: 'mu-list' });
    const me = M.anonOf('me');
    p.scroll.append(h('div', { class: 'mu-me' }, h('span', { class: 'mu-av big', html: M.anonSvg('me') }), h('b', { text: me.name })));
    const head = h('div', { class: 'mu-lh' }, h('b', { text: '歌单' }), h('small'), btnIc('plus', () => editSong(null), '加歌'));
    const listEl = h('div', { class: 'mu-rows' });
    p.scroll.append(head, listEl);
    function draw() {
      const list = D.songs();
      head.querySelector('small').textContent = list.length ? `${list.length} 首` : '';
      listEl.innerHTML = '';
      if (!list.length) { listEl.append(h('div', { class: 'empty', text: '还没有歌' })); return; }
      list.forEach((s, i) => listEl.append(songRow(s, i + 1, () => { M.pick(s.id); if (!M.nowPlaying().playing) M.toggle(); stack.pop(); })));
    }
    const off = D.on('songs', draw);
    draw();
    stack.push({ el: p.el, onShow: draw, onDestroy: off });
  }
  /** 歌单里的一行：序号、歌名、歌手；右边收藏、推荐。长按 改·删 */
  function songRow(s, n, onTap) {
    const it = h('div', { class: 'mu-row' + (s.id === M.nowPlaying().id ? ' cur' : ''), onclick: onTap },
      h('em', { text: n }),
      h('div', { class: 'mu-rt' }, h('b', { text: s.title }), h('small', { text: s.artist || '' })),
      h('button', { class: 'ibtn' + (s.fav ? ' on' : ''), 'aria-label': '收藏', html: icon(s.fav ? 'heartf' : 'heart'), onclick: (e) => { e.stopPropagation(); D.saveSong({ ...D.songById(s.id), fav: !s.fav }); } }),
      h('button', { class: 'ibtn', 'aria-label': '推荐', html: icon('send'), onclick: (e) => { e.stopPropagation(); recommend(s.id); } }));
    longPress(it, (e) => popbar(it, [
      ['edit', () => editSong(s.id), '修改'],
      ['trash', async () => { if (await confirm(`删除《${s.title}》？`, '评论也会一起删掉。', '删除', true)) D.removeSong(s.id); }, '删除'],
    ], { x: e.clientX, y: e.clientY }));
    return it;
  }
  /** 推荐给一个角色：聊天里出一张卡片，跳过去 */
  function recommend(id) {
    const s = D.songById(id);
    if (!s) return;
    pickChar('', (c) => {
      M.letKnow(s.id, c.id);
      CS.send(c.id, [{ t: 'song', song: s.id, title: s.title, artist: s.artist || '' }]);
      openApp('social', { chat: c.id });
    });
  }

  // ── 加歌 / 改歌：封面、歌名、歌手、歌词（能导 .lrc）、链接 ──
  function editSong(id) {
    const old = id ? D.songById(id) : null;
    if (id && !old) return;
    const v = { title: old?.title || '', artist: old?.artist || '', link: old?.link || '', lyrics: old ? M.lyricsText(old) : '', cover: old ? D.file('song.' + old.id) : null };
    const v0 = JSON.stringify(v);
    const dirty = () => JSON.stringify(v) !== v0;
    const ok = btnIc('check', () => save(), '存好');
    const back = async () => {
      document.activeElement?.blur();
      if (!dirty()) { stack.pop(); return; }
      const r = await askLeave();
      if (r === 'save') save(); else if (r === 'drop') stack.pop();
    };
    const p = page({ title: '', onBack: back, right: ok, cls: 'mu-edit' });
    const cvWrap = h('div', { class: 'mu-ecv' });
    const drawCover = () => {
      cvWrap.innerHTML = '';
      const tile = h('button', { class: 'mu-ecv-b', 'aria-label': '封面', onclick: async () => { const src = await pickImage({ max: 640, square: true }); if (src) { v.cover = src; drawCover(); } } },
        v.cover ? h('div', { class: 'sg-cv', style: { backgroundImage: `url(${v.cover})` } }) : h('div', { class: 'sg-cv', html: icon('note8') }));
      cvWrap.append(tile);
      if (v.cover) cvWrap.append(h('button', { class: 'mu-ecv-x', 'aria-label': '去掉封面', html: icon('close'), onclick: () => { v.cover = null; drawCover(); } }));
    };
    const form = h('div');
    const drawForm = () => {
      form.innerHTML = '';
      form.append(
        group('', inputRow({ label: '歌名', value: v.title, live: true, onchange: (x) => { v.title = x; } }), inputRow({ label: '歌手', value: v.artist, live: true, onchange: (x) => { v.artist = x; } })),
        group('', lyricsRow(), row({ label: '导入 .lrc', icon: 'fileIn', onclick: () => importLrc() })),
        group('', inputRow({ label: '链接', value: v.link, type: 'url', inputmode: 'url', live: true, onchange: (x) => { v.link = x.trim(); } })),
      );
    };
    // 歌词那行：右边显示第一句（不带时间）；点进去整页改（带时间的就是 lrc 原样）
    const lyricsRow = () => {
      const L = M.parseLyrics(v.lyrics);
      const firstLine = L.lines.map((l) => l.text).find(Boolean) || '';
      return h('button', { class: 'row text-row', onclick: () => textPage({ title: '歌词', value: v.lyrics, nav: stack, onSave: (x) => { v.lyrics = x; fillFrom(x); drawForm(); } }) },
        h('span', { class: 'row-l', text: '歌词' }), h('span', { class: 'row-v', text: firstLine }), ic('chev', 'chev'));
    };
    // 歌词里带了歌名、歌手（lrc 的 [ti:] [ar:]）：空着的就填上
    const fillFrom = (raw) => { const L = M.parseLyrics(raw); if (!v.title.trim() && L.title) v.title = L.title; if (!v.artist.trim() && L.artist) v.artist = L.artist; };
    function importLrc() {
      const inp = h('input', { type: 'file', accept: '.lrc,.txt,text/plain', style: { display: 'none' } });
      document.body.append(inp);
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0];
        inp.remove();
        if (!f) return;
        const buf = await f.arrayBuffer();
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('gb18030').decode(buf); }
        v.lyrics = text.replace(/^﻿/, '');
        fillFrom(v.lyrics);
        // 文件名常是「歌手 - 歌名.lrc」
        if (!v.title.trim()) {
          const base = f.name.replace(/\.(lrc|txt)$/i, '');
          const m = base.split(/\s+-\s+/);
          if (m.length === 2) { v.title = m[1]; if (!v.artist.trim()) v.artist = m[0]; } else v.title = base;
        }
        drawForm();
      });
      inp.click();
    }
    function save() {
      document.activeElement?.blur();
      setTimeout(() => {
        if (!v.title.trim()) { toast('歌名不能是空的'); return; }
        const L = M.parseLyrics(v.lyrics);
        const s = D.saveSong({
          ...(old ? D.songById(old.id) || old : { id: D.uid(), fav: false, know: {}, pass: [], ts: Date.now() }),
          title: v.title.trim(), artist: v.artist.trim(), link: v.link, lines: L.lines, lyricist: L.lyricist, composer: L.composer, dur: M.durOf(L.lines),
        });
        if ((old ? D.file('song.' + s.id) : null) !== v.cover) D.setFile('song.' + s.id, v.cover);
        if (!old) { M.scheduleCrowd(s.id); M.pick(s.id); }
        stack.pop();
      }, 30);
    }
    drawCover();
    drawForm();
    p.scroll.append(cvWrap, form);
    stack.push({ el: p.el, guard: dirty, onBack: back });
  }

  // ── 搜索：歌名、歌手、歌词 ──
  function openSearch() {
    const p = page({ title: '', onBack: () => stack.pop(), cls: 'mu-search' });
    const inp = h('input', { class: 'sr-in', type: 'search', enterkeyhint: 'search', autocomplete: 'off', 'aria-label': '搜索' });
    p.head.querySelector('.ttl').replaceWith(h('label', { class: 'sr-box mu-sr' }, h('span', { class: 'sr-ic', html: icon('search') }), inp));
    const listEl = h('div', { class: 'mu-rows' });
    p.scroll.append(listEl);
    const norm = (x) => String(x || '').toLowerCase().replace(/\s/g, '');
    const draw = () => {
      const q = norm(inp.value);
      listEl.innerHTML = '';
      if (!q) return;
      const hit = D.songs().filter((s) => [s.title, s.artist, ...(s.lines || []).map((l) => l.text)].some((t) => norm(t).includes(q)));
      if (!hit.length) { listEl.append(h('div', { class: 'empty', text: '没有找到' })); return; }
      hit.forEach((s, i) => listEl.append(songRow(s, i + 1, () => { M.pick(s.id); if (!M.nowPlaying().playing) M.toggle(); stack.pop(); })));
    };
    inp.addEventListener('input', draw);
    const off = D.on('songs', draw);
    stack.push({ el: p.el, onDestroy: off });
    setTimeout(() => inp.focus(), 360);
  }

  // ── 评论区：一个半屏到全屏的面板。楼 + 楼里的回复；喜欢 / 不喜欢；点一条回复它；长按 改·删 ──
  function openComments(id) {
    if (!D.songById(id)) return;
    let replyTo = null;
    const listEl = h('div', { class: 'cm-list mu-cms-l' });
    const ta = h('textarea', { class: 'ch-in', rows: 1 });
    const fit = autosize(ta, 110);
    const send = h('button', { class: 'ch-send', 'aria-label': '发送', html: icon('send') });
    const aux = h('div', { class: 'ch-aux', hidden: true });
    ta.addEventListener('input', () => { send.classList.toggle('go', !!ta.value.trim()); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send.click(); } });
    send.addEventListener('pointerdown', (e) => e.preventDefault());
    send.onclick = () => {
      const text = ta.value.trim();
      if (!text) return;
      const cm = M.addMyComment(id, { to: replyTo?.id || null, text });
      ta.value = ''; fit(); send.classList.remove('go');
      setReply(null);
      requestAnimationFrame(() => listEl.querySelector(`[data-id="${cm.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    function setReply(x) {
      replyTo = x;
      aux.innerHTML = '';
      aux.hidden = !x;
      if (x) { aux.append(h('span', { class: 'aux-ic', html: icon('reply') }), h('span', { class: 'aux-t', text: `${M.anonOf(x.who).name}：${x.text}` }), h('button', { 'aria-label': '不回了', html: icon('close'), onclick: () => setReply(null) })); ta.focus(); }
    }
    const foot = h('div', { class: 'cm-foot' }, aux, h('div', { class: 'ch-bar' }, ta, send));
    const s = sheet({ title: '评论', cls: 'mu-cms', body: listEl, foot, onClose: () => off() });
    const head = s.box.querySelector('.sh-head b');
    function draw() {
      const all = D.songCmts(id).sort((a, z) => a.ts - z.ts);
      head.textContent = all.length ? `${all.length} 条评论` : '评论';
      const byId = new Map(all.map((x) => [x.id, x]));
      const rootOf = (x) => { let r = x, n = 0; while (r.to && byId.get(r.to) && n++ < 50) r = byId.get(r.to); return r; };
      const kids = new Map();
      for (const x of all) if (x.to) { const r = rootOf(x); if (r !== x) { if (!kids.has(r.id)) kids.set(r.id, []); kids.get(r.id).push(x); } }
      listEl.innerHTML = '';
      if (!all.length) { listEl.append(h('div', { class: 'empty', text: '还没有评论' })); return; }
      for (const x of all) {
        if (x.to && rootOf(x) !== x) continue;
        listEl.append(itemEl(x, false, byId));
        for (const y of kids.get(x.id) || []) listEl.append(itemEl(y, true, byId));
      }
    }
    function itemEl(x, isRe, byId) {
      const a = M.anonOf(x.who), to = isRe ? byId.get(x.to) : null;
      const txt = h('p');
      if (to?.to) txt.append(h('span', { class: 'cm-to', text: `回复 ${M.anonOf(to.who).name}：` }));
      txt.append(x.text);
      const vote = (kind, ic, label) => {
        const on = (x[kind] || []).includes('me'), n = (x[kind] || []).length;
        return h('button', { class: 'mu-vote' + (on ? ' on' : ''), 'aria-label': label, onclick: (e) => { e.stopPropagation(); M.vote(id, x.id, kind); } },
          h('span', { html: icon(ic) }), kind === 'likes' && n ? h('small', { text: n }) : null);
      };
      const el = h('div', { class: 'cm-it mu-cm' + (isRe ? ' re' : ''), 'data-id': x.id, onclick: () => { if (x.who !== 'me' && !txt.isContentEditable) setReply(x); } },
        h('span', { class: 'mu-av' + (isRe ? ' xs' : ''), html: M.anonSvg(x.who) }),
        h('div', { class: 'cm-main' }, h('b', { text: a.name }), txt, h('small', { text: ago(x.ts) })),
        h('div', { class: 'mu-votes' }, vote('likes', 'thumb', '喜欢'), vote('dislikes', 'thumbd', '不喜欢')));
      longPress(el, (e) => popbar(el, [
        ['edit', () => {
          txt.querySelector('.cm-to')?.remove();
          inlineEdit(txt, x.text, { save: (val) => { if (!val) { toast('不能是空的'); return false; } if (val !== x.text) D.setSongCmts(id, D.songCmts(id).map((y) => (y.id === x.id ? { ...y, text: val } : y))); }, done: () => draw() });
        }, '编辑'],
        ['trash', () => {
          const all = D.songCmts(id), drop = new Set([x.id]);
          let more = true;
          while (more) { more = false; for (const y of all) if (y.to && drop.has(y.to) && !drop.has(y.id)) { drop.add(y.id); more = true; } }
          D.setSongCmts(id, all.filter((y) => !drop.has(y.id)));
        }, '删除'],
      ], { x: e.clientX, y: e.clientY }));
      return el;
    }
    const off = D.on('songcm', (sid) => { if (sid === id && !inlineEditing()) draw(); });
    draw();
  }

  // 从聊天里的歌卡片进来：换到那首，打开评论区
  function go(a) {
    if (!a?.song || !D.songById(a.song)) return;
    while (stack.pages.length > 1) { const p = stack.pages.pop(); p.el.remove(); p.shade?.remove(); p.onDestroy?.(); }
    stack.top.el.style.transform = '';
    M.pick(a.song);
    stack.top.onShow?.();
    if (a.comments) setTimeout(() => openComments(a.song), 260);
  }
  go(arg);

  return {
    go,
    destroy() { offs.forEach((f) => f()); dark(false); stack.destroyAll(); },
  };
}
