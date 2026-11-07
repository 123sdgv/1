// 聊天页：气泡、红包转账、文字照片、重新生成（左右翻）、编辑删除、输入栏和加号面板
import { h, page, avatar, icon, btnIc, menu, dialog, ask, toast, longPress, autosize, sheet } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { sep, hm } from '../../core/time.js';
import { fmtYuan } from '../../core/parse.js';
import * as CS from '../../core/chat.js';
import { photoTile, viewPhoto } from '../shared.js';
import { editChar } from './char.js';
import { openApp } from '../../phone/window.js';

const PAGE = 80; // 一次显示多少条记录，往上翻再加载

export function openChat(ctx, cid) {
  const c = D.charById(cid);
  if (!c) return;
  const acc = D.curAccount();
  const sub = h('small', { class: 'ch-sub' });
  const pg = page({
    title: '', cls: 'chat bub-' + (acc.bubble || 'ink'),
    onBack: () => ctx.stack.pop(),
    right: [btnIc('door', () => goOffline(cid), '线下见面'), btnIc('more', () => editChar(ctx, cid), '资料')],
  });
  const ttl = pg.head.querySelector('.ttl');
  const tbox = h('div', { class: 'ch-ttl' });
  ttl.before(tbox);
  tbox.append(ttl, sub);
  const list = h('div', { class: 'ch-list' });
  pg.scroll.classList.add('ch-scroll');
  pg.scroll.append(list);

  // ── 输入栏 ──
  const ta = h('textarea', { class: 'ch-in', rows: 1, placeholder: '发消息…' });
  const fit = autosize(ta, 120);
  const sendBtn = h('button', { class: 'ch-send', 'aria-label': '发送' });
  const plus = h('button', { class: 'ch-plus', 'aria-label': '更多', html: icon('plusc'), onclick: () => plusPanel() });
  const bar = h('div', { class: 'ch-bar' }, plus, ta, sendBtn);
  pg.el.append(bar);
  ta.addEventListener('input', drawSend);
  ta.addEventListener('focus', () => setTimeout(() => toBottom(true), 300));
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // 点发送不收起键盘
  sendBtn.addEventListener('click', () => {
    if (CS.busy(cid)) { CS.stop(cid); return; }
    const text = ta.value.trim();
    if (text) { CS.send(cid, [{ t: 'text', text }]); ta.value = ''; fit(); drawSend(); toBottom(true); }
    else CS.reply(cid).then(err);
  });
  function drawSend() {
    const b = CS.busy(cid), has = !!ta.value.trim();
    sendBtn.className = 'ch-send' + (b ? ' stop' : has ? ' go' : ' spark');
    sendBtn.innerHTML = icon(b ? 'stop' : has ? 'send' : 'spark');
    sendBtn.setAttribute('aria-label', b ? '停止' : has ? '发送' : '让他回复');
    ta.placeholder = b ? '对方正在输入…' : '发消息…（空着点 ✦ 让他回）';
  }
  const err = () => {};

  // ── 消息列表：按记录增量刷新 ──
  let shown = PAGE;
  const els = new Map(); // id -> { el, sig }
  function sig(r, isLast) { return JSON.stringify([r.cur, r.alts?.length, D.partsOf(r), !!r.pending, r.error || '', isLast]); }
  function draw() {
    const all = D.msgs(cid);
    const recs = all.slice(-shown);
    const nearBottom = pg.scroll.scrollHeight - pg.scroll.scrollTop - pg.scroll.clientHeight < 140;
    const lastThem = [...all].reverse().find((r) => r.role !== 'note');
    const keep = new Set(recs.map((r) => r.id));
    for (const [id, x] of els) if (!keep.has(id)) { x.el.remove(); els.delete(id); }
    let prevTs = 0, anchor = null;
    if (all.length > recs.length && !list.querySelector('.ch-older')) list.prepend(h('button', { class: 'ch-older', text: '查看更早的消息', onclick: () => { const h0 = pg.scroll.scrollHeight; shown += PAGE; list.querySelector('.ch-older')?.remove(); draw(); pg.scroll.scrollTop += pg.scroll.scrollHeight - h0; } }));
    if (all.length <= recs.length) list.querySelector('.ch-older')?.remove();
    for (const r of recs) {
      const isLast = r === lastThem && r.role === 'them';
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
    sub.textContent = CS.busy(cid) ? '对方正在输入…' : '';
    pg.setTitle(D.nameOf(D.charById(cid)) || '');
    drawSend();
    if (nearBottom) toBottom();
  }
  function toBottom(smooth) { requestAnimationFrame(() => pg.scroll.scrollTo({ top: pg.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })); }

  function recEl(r, isLast, showTime) {
    const wrap = h('div', { class: 'rec ' + r.role, 'data-id': r.id });
    if (showTime) wrap.append(h('div', { class: 'ch-time', text: sep(r.ts) }));
    const parts = D.partsOf(r);
    if (r.role === 'note') { wrap.append(...parts.map((p) => h('div', { class: 'ch-note', text: p.text }))); return wrap; }
    const ch = D.charById(cid), me = D.curAccount();
    parts.forEach((p, i) => {
      const bub = partEl(r, p, i);
      const line = h('div', { class: 'ln' },
        r.role === 'them' ? avatar(ch?.avatar, D.nameOf(ch), 'sm') : null,
        bub,
        r.role === 'me' ? avatar(me.avatar, me.name, 'sm') : null);
      longPress(bub, () => partMenu(r, i, isLast));
      wrap.append(line);
    });
    if (r.pending && !parts.length) wrap.append(h('div', { class: 'ln' }, avatar(ch?.avatar, D.nameOf(ch), 'sm'), h('div', { class: 'bub typing' }, h('span', { class: 'dots3' }, h('i'), h('i'), h('i')))));
    if (r.error) wrap.append(h('button', { class: 'ch-err', onclick: () => regen(), text: `没回成：${r.error}　点这里重试` }));
    if (isLast && !r.pending && parts.length) {
      const n = r.alts.length;
      wrap.append(h('div', { class: 'ch-ctl' },
        n > 1 ? h('button', { 'aria-label': '上一个', html: icon('left'), disabled: r.cur === 0 || null, onclick: () => flipAlt(r, -1) }) : null,
        n > 1 ? h('span', { text: `${r.cur + 1} / ${n}` }) : null,
        n > 1 ? h('button', { 'aria-label': '下一个', html: icon('right'), disabled: r.cur === n - 1 || null, onclick: () => flipAlt(r, 1) }) : null,
        h('button', { class: 'ch-regen', 'aria-label': '重新生成', html: icon('redo'), onclick: () => regen() })));
    }
    return wrap;
  }

  function partEl(r, p, i) {
    const mine = r.role === 'me';
    if (p.t === 'text') return h('div', { class: 'bub', text: p.text });
    if (p.t === 'photo') return photoTile(p.desc, { cls: 'bub-ph', onclick: () => viewPhoto({ desc: p.desc, ts: r.ts, who: mine ? 'me' : cid }) });
    if (p.t === 'red') {
      const done = p.state !== 'open';
      return h('button', { class: 'card red' + (done ? ' done' : ''), onclick: () => tapRed(r, p, mine) },
        h('div', { class: 'cd-top' }, h('span', { class: 'cd-ic', html: icon('red') }), h('div', {}, h('b', { text: p.note || '恭喜发财' }), done ? h('small', { text: p.state === 'taken' ? '已领取' : '已过期' }) : null)),
        h('div', { class: 'cd-foot', text: '红包' }));
    }
    if (p.t === 'pay') {
      const st = { wait: mine ? '等待对方收款' : '点一下收款', taken: '已收款', back: '已退还' }[p.state];
      return h('button', { class: 'card pay' + (p.state !== 'wait' ? ' done' : ''), onclick: () => tapPay(r, p, mine) },
        h('div', { class: 'cd-top' }, h('span', { class: 'cd-ic', html: icon('pay') }), h('div', {}, h('b', { text: '¥' + fmtYuan(p.amount) }), h('small', { text: p.note || st }))),
        h('div', { class: 'cd-foot', text: '转账' + (p.note ? ' · ' + st : '') }));
    }
    return h('div', { class: 'bub', text: '' });
  }

  // ── 红包、转账 ──
  function tapRed(r, p, mine) {
    if (mine || p.state !== 'open') { toast(mine ? (p.state === 'taken' ? `${D.nameOf(c)}已领取` : '等对方领取') : '已经领过了'); return; }
    const amt = h('div', { class: 'rp-amt' });
    const btn = h('button', { class: 'rp-open', text: '開' });
    const box = h('div', { class: 'rp-box' }, avatar(c.avatar, D.nameOf(c)), h('b', { text: `${D.nameOf(c)}的红包` }), h('p', { text: p.note || '恭喜发财' }), btn, amt);
    const s = sheet({ title: '', body: box, cls: 'rp-sheet' });
    btn.onclick = () => {
      btn.classList.add('spin');
      setTimeout(() => {
        p.state = 'taken';
        D.touchMsgs(cid);
        CS.note(cid, `你领取了${D.nameOf(c)}的红包`);
        btn.remove();
        amt.append(h('b', { text: fmtYuan(p.amount) }), h('small', { text: '元' }));
        setTimeout(() => s.close(), 1600);
      }, 700);
    };
  }
  function tapPay(r, p, mine) {
    if (mine || p.state !== 'wait') { toast(mine ? '等对方收款' : p.state === 'taken' ? '已经收过了' : '已经退还了'); return; }
    menu([
      [`收款 ¥${fmtYuan(p.amount)}`, () => { p.state = 'taken'; D.touchMsgs(cid); CS.note(cid, `你已收下${D.nameOf(c)}的转账`); }],
      ['退还', () => { p.state = 'back'; D.touchMsgs(cid); CS.note(cid, `你退还了${D.nameOf(c)}的转账`); }],
    ], `${D.nameOf(c)}转账给你`);
  }

  // ── 长按菜单 ──
  function partMenu(r, i, isLast) {
    const p = D.partsOf(r)[i];
    const items = [];
    if (p.t === 'text') items.push(['复制', () => navigator.clipboard?.writeText(p.text).then(() => toast('已复制'), () => toast('复制不了'))]);
    if (p.t === 'text' || p.t === 'photo') items.push(['编辑', async () => {
      const v = await ask(p.t === 'text' ? '编辑' : '编辑照片的画面', p.t === 'text' ? p.text : p.desc, '', true);
      if (v == null || !v.trim()) return;
      if (p.t === 'text') p.text = v.trim(); else p.desc = v.trim();
      D.touchMsgs(cid);
    }]);
    if (isLast) items.push(['重新生成', () => regen()]);
    items.push(['删除这条', () => {
      const parts = D.partsOf(r);
      parts.splice(i, 1);
      if (!parts.length) D.setMsgs(cid, D.msgs(cid).filter((x) => x.id !== r.id)); else D.touchMsgs(cid);
    }, 'danger']);
    if (D.partsOf(r).length > 1) items.push(['删除这一整组', () => D.setMsgs(cid, D.msgs(cid).filter((x) => x.id !== r.id)), 'danger']);
    menu(items);
  }
  function flipAlt(r, d) { r.cur = Math.max(0, Math.min(r.alts.length - 1, r.cur + d)); D.touchMsgs(cid); }
  function regen() {
    const all = D.msgs(cid);
    const last = [...all].reverse().find((x) => x.role !== 'note');
    if (last?.role === 'them') CS.reply(cid, { regen: true });
    else CS.reply(cid);
  }

  // ── 加号面板 ──
  function plusPanel() {
    const s = sheet({ title: '', body: h('div', { class: 'ch-panel' },
      tile('photo', '相册', () => { s.close(); pickPhoto(); }),
      tile('camera', '拍照', async () => { s.close(); const v = await ask('拍一张', '', '描述这张照片的画面，比如：窗台上的猫，背后是下雨的街', true); if (v?.trim()) { CS.send(cid, [{ t: 'photo', desc: v.trim() }]); toBottom(true); } }),
      tile('red', '红包', () => { s.close(); money('red'); }),
      tile('pay', '转账', () => { s.close(); money('pay'); }),
      tile('door', '线下', () => { s.close(); goOffline(cid); })) });
  }
  const tile = (ic, name, fn) => h('button', { class: 'ch-tile', onclick: fn }, h('span', { html: icon(ic) }), h('small', { text: name }));
  function pickPhoto() {
    const ps = D.photosOf();
    const grid = h('div', { class: 'ph-grid' });
    const s = sheet({ title: '选一张照片', body: grid, full: true });
    if (!ps.length) grid.append(h('div', { class: 'empty', text: '相册是空的。可以先用「拍照」写一张，或者去相册 App 里添加。' }));
    for (const p of ps) grid.append(photoTile(p.desc, { onclick: () => { s.close(); CS.send(cid, [{ t: 'photo', desc: p.desc }]); toBottom(true); } }));
  }
  async function money(kind) {
    const amt = h('input', { class: 'dlg-in', type: 'text', inputmode: 'decimal', placeholder: '金额' });
    const nt = h('input', { class: 'dlg-in', type: 'text', placeholder: kind === 'red' ? '恭喜发财' : '备注（可以不写）' });
    const ok = await new Promise((res) => {
      const body = h('div', { class: 'money' }, h('label', {}, h('span', { text: '金额（元）' }), amt), h('label', {}, h('span', { text: kind === 'red' ? '祝福语' : '备注' }), nt),
        h('button', { class: 'btn wide', text: kind === 'red' ? '塞钱进红包' : '转账', onclick: () => { res(true); s.close(); } }));
      const s = sheet({ title: kind === 'red' ? '发红包' : '转账', body, onClose: () => res(false) });
      setTimeout(() => amt.focus(), 300);
    });
    const n = parseFloat(amt.value);
    if (!ok) return;
    if (!(n > 0)) { toast('金额要大于 0'); return; }
    const part = kind === 'red' ? { t: 'red', amount: Math.round(n * 100) / 100, note: nt.value.trim() || '恭喜发财', state: 'open' } : { t: 'pay', amount: Math.round(n * 100) / 100, note: nt.value.trim(), state: 'wait' };
    CS.send(cid, [part]);
    toBottom(true);
  }

  const offs = [D.on('msgs', (id) => id === cid && draw()), D.on('typing', (id) => id === cid && draw()), D.on('chars', draw), D.on('account', draw)];
  ctx.push({ el: pg.el, onShow: () => CS.setViewing(cid), onHide: () => CS.setViewing(null), onDestroy: () => { CS.setViewing(null); offs.forEach((f) => f()); } });
  CS.setViewing(cid);
  draw();
  toBottom();
}

/** 线下：有这个角色的剧情就打开最近一段，没有就新建一段 */
export function goOffline(cid) {
  const st = D.storiesOf().find((s) => s.char === cid);
  openApp('offline', st ? { story: st.id } : { newFor: cid });
}
