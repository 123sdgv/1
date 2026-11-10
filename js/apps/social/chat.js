// 聊天页：气泡、引用、语音、表情包、文字照片、转账、日程卡片、转发的聊天记录、重新生成（左右翻）。
// 长按气泡冒出黑色小条：引用 · 编辑 · 撤回（只有你自己发的） · 重新回复 · 删除 · 多选。编辑在下面的输入栏里改。
// 撤回了的那条只剩一行小字「X 撤回了一条消息」（他也能撤回自己的：[撤回]）；长按那行小字可以删掉。
// 多选：每条前面一个圆圈，一次删掉或者合并转发（到动态、或者别的角色）。
// 你发完消息他会自动回（core/chat.js 的 autoReply），不用点按钮。
import { h, page, avatar, icon, btnIc, menu, toast, longPress, autosize, sheet, popbar, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { sep, md } from '../../core/time.js';
import { fmtYuan, makeVoice, quoteText } from '../../core/parse.js';
import * as CS from '../../core/chat.js';
import { photoTile, viewPhoto, fwdCard, bookCover } from '../shared.js';
import { join as joinBook } from '../../core/read.js';
import { editChar } from './char.js';
import { stickerSheet } from './stickers.js';
import { composeMoment } from './moments.js';
import { openApp } from '../../phone/window.js';

const PAGE = 80; // 一次显示多少条记录，往上翻再加载
const meName = () => D.curAccount().name || '我';

export function openChat(ctx, cid, { at = null } = {}) {
  const c = D.charById(cid);
  if (!c) return;
  const sub = h('small', { class: 'ch-sub' });
  const moreBtn = btnIc('more', () => editChar(ctx, cid), '资料');
  const pg = page({ title: '', cls: 'chat', onBack: () => ctx.stack.pop(), right: [moreBtn] });
  const ttl = pg.head.querySelector('.ttl');
  const tbox = h('div', { class: 'ch-ttl' });
  ttl.before(tbox);
  tbox.append(ttl, sub);
  // 多选时左上角变成 ×
  const backBtn = pg.head.querySelector('.bk');
  const xBtn = h('button', { class: 'bk', 'aria-label': '退出多选', html: icon('close'), hidden: true, onclick: () => setSel(null) });
  backBtn.after(xBtn);
  const list = h('div', { class: 'ch-list' });
  pg.scroll.classList.add('ch-scroll');
  pg.scroll.append(list);
  const nameOf = (who) => (who === 'them' ? D.nameOf(D.charById(cid)) : meName());

  // ── 输入栏：上面一条（引用 / 正在编辑）+ 输入框、加号、发送 ──
  let quote = null;   // { who, text }
  let editing = null; // { id, i, draft }
  let sel = null;     // 多选时：Set('记录id:第几个')
  const aux = h('div', { class: 'ch-aux', hidden: true });
  const ta = h('textarea', { class: 'ch-in', rows: 1, enterkeyhint: 'send' });
  // 回车发送（打中文时用回车选字不算；Shift+回车换行）
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendBtn.click(); } });
  const fit = autosize(ta, 120);
  const sendBtn = h('button', { class: 'ch-send', 'aria-label': '发送' });
  const plus = h('button', { class: 'ch-plus', 'aria-label': '更多', html: icon('plusc'), onclick: () => plusPanel() });
  const bar = h('div', { class: 'ch-bar' }, ta, plus, sendBtn);
  const delSel = h('button', { 'aria-label': '删除', html: icon('trash'), onclick: () => deleteSel() });
  const fwdSel = h('button', { 'aria-label': '转发', html: icon('fwd'), onclick: () => forwardSel() });
  const selBar = h('div', { class: 'ch-selbar', hidden: true }, delSel, fwdSel);
  const foot = h('div', { class: 'ch-foot' }, aux, bar, selBar);
  pg.el.append(foot);
  ta.addEventListener('input', () => { drawSend(); if (ta.value && !editing) CS.typing(cid); });
  ta.addEventListener('focus', () => setTimeout(() => toBottom(true), 300));
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // 点发送不收起键盘
  sendBtn.addEventListener('click', () => {
    if (editing) { endEdit(true); return; }
    const text = ta.value.trim();
    if (text) { sendParts([{ t: 'text', text }]); ta.value = ''; fit(); drawSend(); return; }
    if (CS.busy(cid)) CS.stop(cid);
  });
  function sendParts(parts) {
    if (quote && (parts[0].t === 'text' || parts[0].t === 'voice')) { parts[0].quote = quote; setQuote(null); }
    CS.send(cid, parts);
    toBottom(true);
  }
  function drawAux() {
    aux.innerHTML = '';
    aux.hidden = !quote && !editing;
    if (editing) {
      const p = D.partsOf(D.msgs(cid).find((r) => r.id === editing.id) || {})[editing.i];
      aux.append(h('span', { class: 'aux-ic', html: icon('edit') }), h('span', { class: 'aux-t', text: p ? quoteText(p) : '' }), h('button', { 'aria-label': '不改了', html: icon('close'), onclick: () => endEdit(false) }));
    } else if (quote) {
      aux.append(h('span', { class: 'aux-ic', html: icon('quote') }), h('span', { class: 'aux-t', text: `${nameOf(quote.who)}：${quote.text}` }), h('button', { 'aria-label': '不引用了', html: icon('close'), onclick: () => setQuote(null) }));
    }
  }
  function setQuote(q) { quote = q; drawAux(); }
  function drawSend() {
    const stop = !editing && CS.busy(cid) && !ta.value.trim();
    sendBtn.className = 'ch-send' + (stop ? ' stop' : ta.value.trim() ? ' go' : '');
    sendBtn.innerHTML = icon(editing ? 'check' : stop ? 'stop' : 'send');
    sendBtn.setAttribute('aria-label', editing ? '改好了' : stop ? '停下' : '发送');
  }
  // 编辑：把那条的字放进输入框里改，打勾保存
  function startEdit(r, i) {
    const p = D.partsOf(r)[i];
    if (!p) return;
    quote = null;
    editing = { id: r.id, i, draft: editing ? editing.draft : ta.value };
    ta.value = p.t === 'photo' ? p.desc : p.text;
    drawAux(); fit(); drawSend();
    ta.focus();
  }
  function endEdit(save) {
    if (!editing) return;
    const v = ta.value.trim();
    if (save && !v) { toast('不能是空的'); return; }
    if (save) {
      const r = D.msgs(cid).find((x) => x.id === editing.id), p = r && D.partsOf(r)[editing.i];
      if (p) {
        if (p.t === 'photo') p.desc = v;
        else if (p.t === 'voice') Object.assign(p, makeVoice(v), p.quote ? { quote: p.quote } : {});
        else p.text = v;
        D.touchMsgs(cid);
      }
    }
    ta.value = editing.draft || '';
    editing = null;
    drawAux(); fit(); drawSend();
  }

  // ── 多选 ──
  const keyOf = (r, i) => r.id + ':' + i;
  function setSel(s) {
    sel = s;
    pg.el.classList.toggle('selecting', !!sel);
    xBtn.hidden = !sel; backBtn.hidden = !!sel; moreBtn.hidden = !!sel;
    bar.hidden = !!sel; selBar.hidden = !sel;
    if (sel) { if (editing) endEdit(false); setQuote(null); document.activeElement?.blur(); }
    drawAux();
    draw();
  }
  function toggleSel(r, i) {
    const k = keyOf(r, i);
    if (sel.has(k)) sel.delete(k); else sel.add(k);
    draw();
  }
  function selected() {
    const out = [];
    for (const r of D.msgs(cid)) D.partsOf(r).forEach((p, i) => { if (p.t !== 'recall' && sel.has(keyOf(r, i))) out.push({ r, i, p }); });
    return out;
  }
  async function deleteSel() {
    const items = selected();
    if (!items.length) return;
    if (!(await confirm(`删除 ${items.length} 条？`, '', '删除', true))) return;
    const drop = new Set(items.map((x) => keyOf(x.r, x.i)));
    CS.removeParts(cid, (r, i) => drop.has(keyOf(r, i)));
    setSel(null);
  }
  function forwardSel() {
    const items = selected();
    if (!items.length) return;
    const fwd = {
      t: 'fwd', title: `${meName()}和${D.nameOf(c)}的聊天记录`,
      items: items.map(({ r, p }) => ({ name: r.role === 'me' ? meName() : c.name || D.nameOf(c), text: quoteText(p, 400) })),
    };
    const body = h('div', { class: 'pick-list' });
    const s = sheet({ title: '转发到', body });
    body.append(h('button', { class: 'pick-it', onclick: () => { s.close(); setSel(null); composeMoment({ fwd }); } },
      h('span', { class: 'av sm pick-ic', html: icon('star') }), h('span', { text: '动态' })));
    for (const o of D.chars().filter((x) => x.id !== cid)) {
      body.append(h('button', { class: 'pick-it', onclick: () => { s.close(); setSel(null); CS.send(o.id, [fwd]); toast('转发了'); } },
        avatar(o.avatar, D.nameOf(o), 'sm'), h('span', { text: D.nameOf(o) })));
    }
  }

  // ── 消息列表：按记录增量刷新 ──
  let shown = PAGE;
  const els = new Map(); // id -> { el, sig }
  function sig(r, isLast) {
    const s = sel ? D.partsOf(r).map((_, i) => (sel.has(keyOf(r, i)) ? 1 : 0)).join('') : '';
    return JSON.stringify([r.cur, r.alts?.length, D.partsOf(r), !!r.pending, r.error || '', isLast, D.stickers().length, !!sel, s]);
  }
  function draw() {
    const all = D.msgs(cid);
    const recs = all.slice(-shown);
    const nearBottom = pg.scroll.scrollHeight - pg.scroll.scrollTop - pg.scroll.clientHeight < 140;
    const lastAny = [...all].reverse().find((r) => r.role !== 'note');
    const keep = new Set(recs.map((r) => r.id));
    for (const [id, x] of els) if (!keep.has(id)) { x.el.remove(); els.delete(id); }
    let prevTs = 0, anchor = null;
    if (all.length > recs.length && !list.querySelector('.ch-older')) list.prepend(h('button', { class: 'ch-older', text: '查看更早的消息', onclick: () => { const h0 = pg.scroll.scrollHeight; shown += PAGE; list.querySelector('.ch-older')?.remove(); draw(); pg.scroll.scrollTop += pg.scroll.scrollHeight - h0; } }));
    if (all.length <= recs.length) list.querySelector('.ch-older')?.remove();
    for (const r of recs) {
      const isLast = r === lastAny;
      const showTime = r.ts - prevTs > 5 * 60000;
      const s = sig(r, isLast) + showTime;
      let x = els.get(r.id);
      if (!x || x.sig !== s) {
        const el = recEl(r, isLast, showTime);
        if (x) x.el.replaceWith(el); else (anchor ? anchor.after(el) : list.querySelector('.ch-older') ? list.querySelector('.ch-older').after(el) : list.prepend(el));
        x = { el, sig: s };
        els.set(r.id, x);
      } else if (anchor && x.el.previousElementSibling !== anchor) anchor.after(x.el);
      anchor = x.el;
      prevTs = r.ts;
    }
    sub.textContent = CS.isSearching(cid) ? '对方正在搜索…' : CS.busy(cid) ? '对方正在输入…' : '';
    pg.setTitle(D.nameOf(D.charById(cid)) || '');
    drawSend();
    if (sel) { const n = selected().length; delSel.disabled = fwdSel.disabled = !n; }
    if (nearBottom && !sel) toBottom();
  }
  function toBottom(smooth) { requestAnimationFrame(() => pg.scroll.scrollTo({ top: pg.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })); }

  function recEl(r, isLast, showTime) {
    const wrap = h('div', { class: 'rec ' + r.role, 'data-id': r.id });
    if (showTime) wrap.append(h('div', { class: 'ch-time', text: sep(r.ts) }));
    const parts = D.partsOf(r);
    if (r.role === 'note') { wrap.append(...parts.map((p) => h('div', { class: 'ch-note', text: p.text }))); return wrap; }
    const ch = D.charById(cid), me = D.curAccount();
    const av = () => (r.role === 'them' ? avatar(ch?.avatar, D.nameOf(ch), 'sm') : avatar(me.avatar, me.name, 'sm'));
    parts.forEach((p, i) => {
      // 撤回了的：一行小字。长按能删掉；多选时不算在里面
      if (p.t === 'recall') {
        const nt = h('div', { class: 'ch-note', text: `${p.by === 'me' ? '你' : D.nameOf(ch)}撤回了一条消息` });
        if (!sel) longPress(nt, (e) => popbar(nt, [['trash', () => CS.removeParts(cid, (x, k) => x === r && k === i), '删除']], e ? { x: e.clientX, y: e.clientY } : null));
        wrap.append(nt);
        return;
      }
      const main = partEl(r, p);
      const col = h('div', { class: 'bcol' }, main,
        p.t === 'voice' ? h('div', { class: 'vo-txt', text: p.text }) : null,
        p.quote ? h('div', { class: 'qt' }, `${nameOf(p.quote.who || CS.quoteWho(cid, p.quote.text, r.id, r.role === 'them' ? 'me' : 'them'))}：${p.quote.text}`) : null);
      const on = sel?.has(keyOf(r, i));
      const ln = h('div', { class: 'ln' + (on ? ' on' : '') },
        sel ? h('span', { class: 'ck', html: icon(on ? 'ringck' : 'ring') }) : null,
        r.role === 'them' ? av() : null, col, r.role === 'me' ? av() : null);
      if (sel) ln.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggleSel(r, i); }, true);
      else longPress(main, (e) => partBar(main, r, i, isLast, e));
      wrap.append(ln);
    });
    if (r.pending && !parts.length) wrap.append(h('div', { class: 'ln' }, av(), h('div', { class: 'bub typing' }, h('span', { class: 'dots3' }, h('i'), h('i'), h('i')))));
    if (r.error) wrap.append(h('button', { class: 'ch-err', onclick: () => regen(), text: `没回成：${r.error}　点这里重试` }));
    if (isLast && r.role === 'them' && !r.pending && parts.length && r.alts.length > 1 && !sel) {
      const n = r.alts.length;
      wrap.append(h('div', { class: 'ch-ctl' },
        h('button', { 'aria-label': '上一个', html: icon('left'), disabled: r.cur === 0 || null, onclick: () => flipAlt(r, -1) }),
        h('span', { text: `${r.cur + 1} / ${n}` }),
        h('button', { 'aria-label': '下一个', html: icon('right'), disabled: r.cur === n - 1 || null, onclick: () => flipAlt(r, 1) })));
    }
    return wrap;
  }

  function partEl(r, p) {
    const mine = r.role === 'me';
    if (p.t === 'text') return h('div', { class: 'bub', text: p.text });
    if (p.t === 'voice') return h('div', { class: 'bub vo', style: { width: Math.min(210, 74 + p.sec * 4) + 'px' } }, h('span', { class: 'vo-ic', html: icon('voice') }), h('b', { text: p.sec + '″' }));
    if (p.t === 'sticker') {
      const st = D.stickerByName(p.name);
      return st ? h('img', { class: 'stk', src: st.src, alt: p.name, draggable: 'false' }) : h('div', { class: 'stk-miss' }, h('span', { html: icon('smile') }), p.name);
    }
    if (p.t === 'photo') return photoTile(p.desc, { cls: 'bub-ph', onclick: () => viewPhoto({ desc: p.desc, ts: r.ts, who: mine ? 'me' : cid }) });
    if (p.t === 'pay' || p.t === 'red') {
      const state = p.state === 'open' ? 'wait' : p.state;
      const st = { wait: mine ? '等对方收款' : '点一下收款', taken: '已收款', back: '已退还' }[state];
      return h('button', { class: 'card pay' + (state !== 'wait' ? ' done' : ''), onclick: () => tapPay(p, mine, state) },
        h('div', { class: 'cd-top' }, h('span', { class: 'cd-ic', html: icon('pay') }), h('div', {}, h('b', { text: '¥' + fmtYuan(p.amount) }), h('small', { text: p.note || st }))),
        h('div', { class: 'cd-foot', text: '转账' + (p.note ? ' · ' + st : '') }));
    }
    if (p.t === 'event') {
      return h('button', { class: 'card ev', onclick: () => openApp('calendar') },
        h('div', { class: 'cd-top' }, h('span', { class: 'cd-ic', html: icon('cal') }), h('div', {}, h('b', { text: p.title }), h('small', { text: (p.yearly ? '每年 ' : '') + md(new Date(p.date + 'T12:00:00').getTime()) }))),
        h('div', { class: 'cd-foot', text: '记进了日历' }));
    }
    if (p.t === 'fwd') return fwdCard(p);
    if (p.t === 'book') {
      const b = D.bookById(p.book), n = b ? D.chapters(b.id).length : 0;
      return h('button', { class: 'card bookc', onclick: () => (b ? openApp('read', { book: b.id }) : toast('这本书已经删掉了')) },
        h('div', { class: 'cd-top' }, bookCover(p.title, '', { mini: true }), h('div', {}, h('b', { text: `《${b?.title || p.title}》` }), h('small', { text: n ? `${n} 章` : '' }))),
        h('div', { class: 'cd-foot', text: '一起读' }));
    }
    return h('div', { class: 'bub', text: '' });
  }

  // ── 转账 ──
  function tapPay(p, mine, state) {
    if (mine || state !== 'wait') { toast(mine ? (state === 'taken' ? '对方已收款' : state === 'back' ? '对方退还了' : '等对方收款') : state === 'taken' ? '已经收过了' : '已经退还了'); return; }
    menu([
      [`收款 ¥${fmtYuan(p.amount)}`, () => { p.state = 'taken'; D.touchMsgs(cid); CS.note(cid, `你已收下${D.nameOf(c)}的转账`); }],
      ['退还', () => { p.state = 'back'; D.touchMsgs(cid); CS.note(cid, `你退还了${D.nameOf(c)}的转账`); }],
    ], `${D.nameOf(c)}转账给你`);
  }

  // ── 长按：黑色小条 ──
  function partBar(anchor, r, i, isLast, e) {
    const p = D.partsOf(r)[i];
    if (!p) return;
    popbar(anchor, [
      ['quote', () => { if (editing) endEdit(false); setQuote({ who: r.role === 'me' ? 'me' : 'them', text: quoteText(p) }); ta.focus(); }, '引用'],
      ['text', 'voice', 'photo'].includes(p.t) ? ['edit', () => startEdit(r, i), '编辑'] : null,
      r.role === 'me' ? ['undo', () => { if (editing?.id === r.id) endEdit(false); CS.recall(cid, r.id, i); }, '撤回'] : null,
      isLast ? ['redo', () => regen(), '重新回复'] : null,
      ['trash', () => CS.removeParts(cid, (x, k) => x === r && k === i), '删除'],
      ['multi', () => setSel(new Set([keyOf(r, i)])), '多选'],
    ], e ? { x: e.clientX, y: e.clientY } : null);
  }
  function flipAlt(r, d) { r.cur = Math.max(0, Math.min(r.alts.length - 1, r.cur + d)); D.touchMsgs(cid); }
  // 最后一条是他的：重新生成一个版本；是你的：让他回
  function regen() {
    const last = [...D.msgs(cid)].reverse().find((x) => x.role !== 'note');
    if (last?.role === 'them') CS.reply(cid, { regen: true });
    else CS.reply(cid);
  }

  // ── 加号面板（只有图标）──
  function plusPanel() {
    const s = sheet({ title: '', body: h('div', { class: 'ch-panel' },
      tile('smile', '表情包', () => { s.close(); stickerSheet((st) => sendParts([{ t: 'sticker', name: st.name }])); }),
      tile('photo', '相册', () => { s.close(); pickPhoto(); }),
      tile('camera', '拍照', async () => { s.close(); const v = await textSheet('拍照'); if (v) sendParts([{ t: 'photo', desc: v }]); }),
      tile('mic', '语音', async () => { s.close(); const v = await textSheet('语音'); if (v) sendParts([makeVoice(v)]); }),
      tile('pay', '转账', () => { s.close(); transfer(); }),
      tile('book', '一起读', () => { s.close(); pickBook(); })) });
  }
  // 从书架挑一本发给他：他就加入一起读（core/read.js）
  function pickBook() {
    const list = D.booksOf();
    const body = h('div', { class: 'pick-list' });
    const s = sheet({ title: '一起读', body });
    if (!list.length) body.append(h('div', { class: 'empty', text: '书架是空的' }));
    for (const b of list) {
      const n = D.chapters(b.id).length;
      body.append(h('button', { class: 'pick-it', onclick: () => { s.close(); joinBook(b.id, cid); sendParts([{ t: 'book', book: b.id, title: b.title }]); } },
        bookCover(b.title, 'pick-cv', { mini: true }), h('div', {}, h('b', { text: b.title }), h('small', { text: n ? `${n} 章` : '' }))));
    }
  }
  const tile = (ic, name, fn) => h('button', { class: 'ch-tile', 'aria-label': name, onclick: fn }, h('span', { html: icon(ic) }));
  function pickPhoto() {
    const ps = D.photosOf();
    const grid = h('div', { class: 'ph-grid' });
    const s = sheet({ title: '相册', body: grid, full: true });
    if (!ps.length) grid.append(h('div', { class: 'empty', text: '相册是空的' }));
    for (const p of ps) grid.append(photoTile(p.desc, { onclick: () => { s.close(); sendParts([{ t: 'photo', desc: p.desc }]); } }));
  }
  /** 写一段字（照片的画面、语音说的话）。返回文字或 null */
  function textSheet(title) {
    return new Promise((res) => {
      const t1 = h('textarea', { class: 'dlg-in', rows: 4 });
      let done = false;
      const s = sheet({ title, onClose: () => { if (!done) res(null); }, body: h('div', { class: 'money' },
        h('label', {}, t1),
        h('button', { class: 'btn wide', text: '发送', onclick: () => {
          if (!t1.value.trim()) return;
          done = true; res(t1.value.trim()); s.close();
        } })) });
      setTimeout(() => t1.focus(), 300);
    });
  }
  async function transfer() {
    const amt = h('input', { class: 'dlg-in', type: 'text', inputmode: 'decimal' });
    const nt = h('input', { class: 'dlg-in', type: 'text' });
    const ok = await new Promise((res) => {
      const body = h('div', { class: 'money' }, h('label', {}, h('span', { text: '金额（元）' }), amt), h('label', {}, h('span', { text: '备注' }), nt),
        h('button', { class: 'btn wide', text: '转账', onclick: () => { res(true); s.close(); } }));
      const s = sheet({ title: '转账', body, onClose: () => res(false) });
      setTimeout(() => amt.focus(), 300);
    });
    const n = parseFloat(amt.value);
    if (!ok) return;
    if (!(n > 0)) { toast('金额要大于 0'); return; }
    sendParts([{ t: 'pay', amount: Math.round(n * 100) / 100, note: nt.value.trim(), state: 'wait' }]);
  }

  const offs = [D.on('msgs', (id) => id === cid && draw()), D.on('typing', (id) => id === cid && draw()), D.on('chars', draw), D.on('account', draw), D.on('stickers', draw),
    D.on('searchfail', (x) => x.cid === cid && toast('没搜成：' + x.msg))];
  ctx.push({ el: pg.el, onShow: () => CS.setViewing(cid), onHide: () => CS.setViewing(null), onDestroy: () => { CS.setViewing(null); offs.forEach((f) => f()); } });
  CS.setViewing(cid);
  // 从搜索点进来：翻到那条，闪一下
  if (at) {
    const all = D.msgs(cid), i = all.findIndex((r) => r.id === at);
    if (i >= 0) shown = Math.max(PAGE, all.length - i + 5);
  }
  draw();
  if (at && els.get(at)) {
    const el = els.get(at).el;
    requestAnimationFrame(() => { pg.scroll.scrollTop = el.offsetTop - pg.scroll.clientHeight / 2 + el.offsetHeight / 2; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 1800); });
  } else toBottom();
}
