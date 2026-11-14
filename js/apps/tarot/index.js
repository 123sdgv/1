// 塔罗：你自己抽，模型用中性的塔罗师口吻解（core/tarot.js；提示词在 prompt.js 的 tarotPrompt）。
// 列表（抽过的，新的在上面，左滑 × 删）→ ＋ 写问题、挑牌阵、抽牌 → 洗牌、发牌（背面朝上）→ 自己一张一张翻开（也能点着先翻）→ 都翻开了就开始解。
// 翻开的牌点一下看大图。解好的那段长按 → 黑条：重试、删除（只删解牌和追问）、聊天（这一局的追问）。按身份分开。
import { h, Stack, page, btnIc, icon, group, sheet, swipeRow, autosize, longPress, popbar, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as TA from '../../core/tarot.js';
import { md, hm } from '../../core/time.js';

// 正在解的：离开这页也接着解完，回来接着看。id → { ctrl, text（到现在的字）, changed（最后一次来新字的时候）}
const reading = new Map();

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '塔罗', big: true, left: h('span'), right: btnIc('plus', () => askPage(), '抽牌') });
  pg.el.classList.add('ta');
  const draw = () => {
    pg.scroll.querySelectorAll('.ta-list,.empty').forEach((x) => x.remove());
    const list = D.tarotsOf();
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有' }))); return; }
    const box = h('div', { class: 'ta-list' });
    for (const t of list) {
      const it = h('button', { class: 'ta-it', onclick: () => openReading(t.id) },
        h('div', { class: 'ta-mini' }, t.cards.slice(0, 5).map((c) => h('span', { class: 'ta-mc' + (c.up ? '' : ' rev'), html: TA.faceSvg(c.card) }))),
        h('div', { class: 'ta-it-t' }, h('b', { text: t.q || TA.SPREADS[t.spread].name }), h('small', { text: `${TA.SPREADS[t.spread].name} · ${md(t.ts)} ${hm(t.ts)}` })));
      box.append(swipeRow(it, () => { const j = reading.get(t.id); reading.delete(t.id); j?.ctrl.abort(); TA.dropChat(t.id); D.removeTarot(t.id); }, { icon: 'close' }));
    }
    pg.scroll.append(box);
  };
  const offs = [D.on('tarot', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  // ── 写问题、挑牌阵 ──
  function askPage() {
    const p = page({ title: '抽牌', onBack: () => stack.pop() });
    p.el.classList.add('ta');
    const q = h('textarea', { class: 'row-ta ta-q', rows: 3, spellcheck: 'false' });
    autosize(q, 200);
    let spread = 'three';
    const list = h('div', { class: 'grp-b' });
    const drawSp = () => {
      list.innerHTML = '';
      for (const [k, sp] of Object.entries(TA.SPREADS)) {
        list.append(h('button', { class: 'row', onclick: () => { spread = k; drawSp(); } },
          h('span', { class: 'row-l', text: sp.name }), h('span', { class: 'row-v', text: `${sp.pos.length} 张` }),
          h('span', { class: 'ta-ck', html: k === spread ? icon('check') : '' })));
      }
    };
    drawSp();
    p.scroll.append(
      group('问题', h('div', { class: 'row tall' }, q)),
      h('div', { class: 'grp' }, h('div', { class: 'grp-t', text: '牌阵' }), list),
      h('button', { class: 'btn wide', text: '抽牌', onclick: () => {
        q.blur();
        const d = TA.draw(spread, q.value.trim());
        const rec = D.saveTarot({ id: D.uid(), acc: D.curAccount().id, q: q.value.trim(), ...d, text: '', ts: Date.now() });
        stack.pop();
        setTimeout(() => openReading(rec.id, true), 340);
      } }));
    stack.push({ el: p.el });
    setTimeout(() => q.focus(), 380);
  }

  // ── 一次抽牌：桌上的牌 + 解牌 ──
  function openReading(id, fresh = false) {
    const rec0 = D.tarots().find((t) => t.id === id);
    if (!rec0) return;
    const sp = TA.SPREADS[rec0.spread];
    const p = page({ title: sp.name, onBack: () => stack.pop() });
    p.el.classList.add('ta', 'ta-read');
    const qEl = rec0.q ? h('p', { class: 'ta-qt', text: rec0.q }) : null;
    const board = h('div', { class: 'ta-board' + (sp.small ? ' small' : '') });
    const out = h('div', { class: 'ta-out' });
    p.scroll.append(qEl, board, out);
    stack.push({ el: p.el, onDestroy: () => cleanup() });

    // 牌在桌上的位置：按牌阵的格子坐标，整体缩到页面宽度
    const W = Math.min(p.scroll.clientWidth || 360, 520) - 32;
    const xs = sp.at.map((a) => a[0]), ys = sp.at.map((a) => a[1]);
    const cols = Math.max(...xs) + 1, gx = sp.small ? 8 : 14, label = 22;
    const cw = Math.min(rec0.cards.length === 1 ? 128 : rec0.cards.length <= 3 ? 100 : 88, (W - gx * (cols - 1)) / cols);
    const ch = cw * 1.6;
    const rowStep = ch + label + (sp.small ? 4 : 10);
    const bw = cols * cw + (cols - 1) * gx;
    board.style.width = bw + 'px';
    board.style.height = Math.max(...ys) * rowStep + ch + label + 'px';
    const flipped = new Set(fresh ? [] : rec0.cards.map((_, i) => i));
    const cards = rec0.cards.map((c, i) => {
      const [x, y, rot] = sp.at[i];
      const el = h('button', { class: 'ta-card' + (rot ? ' rot' : '') + (c.up ? '' : ' rev') + (flipped.has(i) ? ' open' : ''), 'aria-label': flipped.has(i) ? `${c.pos} ${c.card}` : `${c.pos}，翻开`,
        style: { width: cw + 'px', height: ch + 'px', left: x * (cw + gx) + 'px', top: y * rowStep + 'px' } },
        h('span', { class: 'ta-in' }, h('span', { class: 'ta-back', html: TA.BACK }), h('span', { class: 'ta-face', html: TA.faceSvg(c.card) })));
      const lb = rot || sp.noLabel?.includes(i) ? null : h('small', { class: 'ta-pos', text: c.pos, style: { left: x * (cw + gx) + 'px', top: y * rowStep + ch + 4 + 'px', width: cw + 'px' } });
      el.addEventListener('click', () => { if (!flipped.has(i)) flip(i); else bigCard(c); });
      board.append(el, lb);
      return el;
    });

    // 刚抽的：先洗牌（中间一叠背面），再一张一张发到位置上，发完自己一张一张翻开
    let dead = false, autoT = 0;
    const flip = (i) => {
      if (flipped.has(i)) return;
      flipped.add(i);
      const el = cards[i], c = rec0.cards[i];
      el.classList.add('open');
      el.setAttribute('aria-label', `${c.pos} ${c.card}`);
      navigator.vibrate?.(6);
      if (flipped.size === rec0.cards.length) setTimeout(() => !dead && startRead(), 650);
    };
    if (fresh) {
      const cx = bw / 2 - cw / 2, cy = Math.min(parseFloat(board.style.height) / 2 - ch / 2, 120);
      const deck = h('div', { class: 'ta-deck', style: { left: cx + 'px', top: cy + 'px', width: cw + 'px', height: ch + 'px' } },
        [0, 1, 2, 3].map((k) => h('span', { class: 'ta-dk', style: { '--k': k }, html: TA.BACK })));
      board.append(deck);
      cards.forEach((el) => { el.classList.add('deal'); el.style.setProperty('--dx', cx - parseFloat(el.style.left) + 'px'); el.style.setProperty('--dy', cy - parseFloat(el.style.top) + 'px'); });
      board.querySelectorAll('.ta-pos').forEach((x) => x.classList.add('hide'));
      const n = cards.length, gap = n <= 3 ? 560 : n <= 5 ? 460 : 380;
      setTimeout(() => {
        cards.forEach((el, i) => setTimeout(() => { el.classList.remove('deal'); }, i * 150));
        setTimeout(() => { deck.classList.add('gone'); board.querySelectorAll('.ta-pos').forEach((x) => x.classList.remove('hide')); }, n * 150 + 300);
        setTimeout(() => deck.remove(), n * 150 + 800);
        // 发完了停一下，再按顺序翻（点过的跳过）
        const next = () => {
          if (dead) return;
          const i = rec0.cards.findIndex((_, k) => !flipped.has(k));
          if (i < 0) return;
          flip(i);
          autoT = setTimeout(next, gap);
        };
        autoT = setTimeout(next, n * 150 + 700);
      }, 1100);
    }

    // 解牌那一块：解好的字 / 正在解（太久没新字，点子下面出重试）/ 写了一半断了（点了接着解）/ 没解成 / 还没解（旧的点「解牌」）
    let shownStale = false;
    function drawOut() {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec) return;
      out.innerHTML = '';
      const job = reading.get(id);
      shownStale = false;
      if (job) {
        out.append(...textEls(job.text || ''), h('span', { class: 'dots3 ta-dots' }, h('i'), h('i'), h('i')));
        if (Date.now() - job.changed > TA.STALE.ms) {
          shownStale = true;
          out.append(h('button', { class: 'ibtn ta-retry', 'aria-label': '重试', html: icon('redo'), onclick: () => startRead(true) }));
        }
        return;
      }
      if (rec.text) { out.append(...textEls(rec.text)); return; }
      if (flipped.size < rec.cards.length) return;
      if (rec.part) {
        out.append(...textEls(rec.part), h('button', { class: 'ch-err ta-err', text: `${rec.error ? '没解完：' + rec.error : '没解完'}　点这里接着解`, onclick: () => startRead(true) }));
        return;
      }
      if (rec.error) { out.append(h('button', { class: 'ch-err ta-err', text: `没解成：${rec.error}　点这里重试`, onclick: () => startRead() })); return; }
      out.append(h('button', { class: 'btn wide ta-go', text: '解牌', onclick: () => startRead() }));
    }
    // 开始解 / 接着解。正在解的那个（卡住了）先停掉、扔掉，再重新来——点了一定有反应
    function startRead(goOn = false) {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec) return;
      const old = reading.get(id);
      const part = goOn ? (old ? old.text : rec.part) || '' : '';
      if (old) { reading.delete(id); old.ctrl.abort(); }
      if (rec.text && !old) { drawOut(); return; }
      const job = { ctrl: new AbortController(), text: part, changed: Date.now() };
      reading.set(id, job);
      drawOut();
      if (!goOn) requestAnimationFrame(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      runRead(id, job, part);
    }
    // 长按解牌那段：重试（从头再解，先问一句）、删除（只删解牌和追问，牌和问题留着）、聊天（这一局的追问）
    longPress(out, (e) => {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec || reading.has(id) || e.target.closest?.('button')) return;
      if (!rec.text && !rec.part) return;
      popbar(out, [
        ['redo', async () => { if (await confirm('重新解一遍？', '', '重新解')) { clearOut(); startRead(); } }, '重试'],
        ['trash', () => clearOut(), '删除'],
        rec.text ? ['comment', () => openChat(id), '聊天'] : null,
      ], { x: e.clientX, y: e.clientY });
    });
    function clearOut() {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec) return;
      TA.dropChat(id);
      D.saveTarot({ ...rec, text: '', part: '', error: '', chat: [] });
    }
    // 正在解的：隔一会儿看看是不是太久没新字了（出不出重试）
    const staleT = setInterval(() => {
      const job = reading.get(id);
      if (job && (Date.now() - job.changed > TA.STALE.ms) !== shownStale) drawOut();
    }, 2000);
    const offs2 = [D.on('tarotText', (x) => x === id && drawOut()), D.on('tarot', (x) => x === id && drawOut())];
    function cleanup() {
      dead = true;
      clearTimeout(autoT);
      clearInterval(staleT);
      offs2.forEach((f) => f());
      // 牌还没翻完就走了：照样解（离开这页也接着解完）
      const rec = D.tarots().find((t) => t.id === id);
      if (fresh && rec && !rec.text && !rec.part && !rec.error && !reading.has(id)) {
        const job = { ctrl: new AbortController(), text: '', changed: Date.now() };
        reading.set(id, job);
        runRead(id, job, '');
      }
    }
    drawOut();
  }

  // ── 追问：这一局接着问（不带人设记忆）。输入框 + 发送，他正在回、框里没字时是停下 ──
  function openChat(id) {
    if (!D.tarots().some((t) => t.id === id)) return;
    const p = page({ title: '追问', cls: 'chat ta-chat', onBack: () => stack.pop() });
    const list = h('div', { class: 'ch-list' });
    p.scroll.classList.add('ch-scroll');
    p.scroll.append(list);
    const ta = h('textarea', { class: 'ch-in', rows: 1, enterkeyhint: 'send' });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendBtn.click(); } });
    const fit = autosize(ta, 120);
    const sendBtn = h('button', { class: 'ch-send', 'aria-label': '发送' });
    p.el.append(h('div', { class: 'ch-foot' }, h('div', { class: 'ch-bar' }, ta, sendBtn)));
    ta.addEventListener('input', () => drawSend());
    ta.addEventListener('focus', () => setTimeout(() => toBottom(true), 300));
    sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    sendBtn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (text) { TA.ask(id, text); ta.value = ''; fit(); drawSend(); toBottom(true); return; }
      if (TA.chatBusy(id)) TA.stopChat(id);
    });
    function drawSend() {
      const stop = TA.chatBusy(id) && !ta.value.trim();
      sendBtn.className = 'ch-send' + (stop ? ' stop' : ta.value.trim() ? ' go' : '');
      sendBtn.innerHTML = icon(stop ? 'stop' : 'send');
      sendBtn.setAttribute('aria-label', stop ? '停下' : '发送');
    }
    const bubble = (who, text) => h('div', { class: 'rec ' + who }, h('div', { class: 'ln' }, h('div', { class: 'bcol' }, h('div', { class: 'bub' }, ...lines(text)))));
    function draw() {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec) { if (stack.top?.el === p.el) stack.pop(); return; }
      const nearBottom = p.scroll.scrollHeight - p.scroll.scrollTop - p.scroll.clientHeight < 80;
      list.innerHTML = '';
      const live = TA.chatLive(id);
      const liveEl = live ? (live.text ? bubble('them', live.text) : h('div', { class: 'rec them' }, h('div', { class: 'ln' }, h('div', { class: 'bub typing' }, h('span', { class: 'dots3' }, h('i'), h('i'), h('i')))))) : null;
      const log = rec.chat || [];
      let k = 0; // 第几条正经的话（不算没回上那行）：他正在写的那条插在 live.at 那里
      for (const m of log) {
        if (liveEl && !m.err && k === live.at) list.append(liveEl);
        if (m.err) { list.append(h('button', { class: 'ch-err', text: `${m.text}　点这里重试`, onclick: () => TA.retryChat(id) })); continue; }
        list.append(bubble(m.who === 'me' ? 'me' : 'them', m.text));
        k++;
      }
      if (liveEl && !liveEl.isConnected) list.append(liveEl);
      drawSend();
      if (nearBottom) toBottom();
    }
    function toBottom(smooth) { requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })); }
    const offs2 = [D.on('tarotChat', (x) => x === id && draw()), D.on('tarot', (x) => x === id && draw())];
    stack.push({ el: p.el, onShow: () => toBottom(), onDestroy: () => offs2.forEach((f) => f()) });
    draw();
    toBottom();
    if (!(D.tarots().find((t) => t.id === id)?.chat || []).length) setTimeout(() => ta.focus(), 380);
  }

  // 一张牌的大图
  function bigCard(c) {
    sheet({ title: c.pos, body: h('div', { class: 'ta-big' },
      h('span', { class: 'ta-big-c' + (c.up ? '' : ' rev'), html: TA.faceSvg(c.card) }),
      h('p', { text: `${c.card} · ${c.up ? '正位' : '逆位'} · ${TA.isMajor(c.card) ? '大阿卡纳' : '小阿卡纳'} · ${TA.elementOf(c.card)}` })) });
  }

  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}

/**
 * 真正去解（离开这页、关掉 App 也接着跑）。边解边存：每 2 秒把写到的放进 part，网页被关掉了回来还能接着解。
 * 这个 job 已经被换掉了（点了重试 / 删了这一局）就什么都不存
 */
async function runRead(id, job, part) {
  const mine = () => reading.get(id) === job;
  const rec = D.tarots().find((x) => x.id === id);
  if (!rec) { reading.delete(id); return; }
  let savedAt = Date.now();
  const keep = (t) => {
    if (Date.now() - savedAt < 2000) return;
    savedAt = Date.now();
    const r = D.tarots().find((x) => x.id === id);
    if (r && mine()) D.saveTarot({ ...r, part: t, error: '' });
  };
  try {
    const text = await TA.read(rec, { part, signal: job.ctrl.signal, onText: (t) => {
      if (!mine()) return;
      if (t !== job.text) { job.text = t; job.changed = Date.now(); }
      D.emit('tarotText', id);
      keep(t);
    } });
    if (!mine()) return;
    if (!text) throw new Error('这次是空的');
    reading.delete(id);
    const r = D.tarots().find((x) => x.id === id);
    if (r) D.saveTarot({ ...r, text, part: '', error: '' });
  } catch (e) {
    if (!mine()) return;
    reading.delete(id);
    const r = D.tarots().find((x) => x.id === id);
    if (r) D.saveTarot({ ...r, part: e.part || job.text || '', error: e.message || '出错了' });
  } finally {
    D.emit('tarotText', id);
  }
}

/** 追问气泡里的字：换行照留 */
const lines = (text) => String(text).split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]));

/** 解牌的字：【小标题】单独一行加粗，别的按空行分段 */
function textEls(text) {
  const out = [];
  for (const block of String(text).split(/\n{2,}/)) {
    const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
    let buf = [];
    const flush = () => { if (buf.length) { out.push(h('p', { class: 'ta-p' }, ...buf.flatMap((l, i) => (i ? [h('br'), l] : [l])))); buf = []; } };
    for (const l of lines) {
      if (/^【[^】]{1,16}】$/.test(l)) { flush(); out.push(h('h4', { class: 'ta-h', text: l.slice(1, -1) })); }
      else buf.push(l.replace(/^#+\s*|\*\*/g, ''));
    }
    flush();
  }
  return out;
}
