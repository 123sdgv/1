// 塔罗：你自己抽，模型用中性的塔罗师口吻解（core/tarot.js；提示词在 prompt.js 的 tarotPrompt）。
// 列表（抽过的，新的在上面，左滑 × 删）→ ＋ 写问题、挑牌阵、抽牌 → 洗牌、发牌（背面朝上）→ 一张一张点开翻牌 → 都翻开了就开始解。
// 翻开的牌点一下看大图。按身份分开。
import { h, Stack, page, btnIc, icon, group, sheet, toast, swipeRow, autosize } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as TA from '../../core/tarot.js';
import { md, hm } from '../../core/time.js';

// 正在解的：离开这页也接着解完，回来接着看
const reading = new Map(); // id → 到现在的字

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
      box.append(swipeRow(it, () => D.removeTarot(t.id), { icon: 'close' }));
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
    stack.push({ el: p.el, onDestroy: () => offs2.forEach((f) => f()) });

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
      el.addEventListener('click', () => {
        if (!flipped.has(i)) {
          flipped.add(i);
          el.classList.add('open');
          el.setAttribute('aria-label', `${c.pos} ${c.card}`);
          navigator.vibrate?.(6);
          if (flipped.size === rec0.cards.length) setTimeout(() => startRead(), 650);
          return;
        }
        bigCard(c);
      });
      board.append(el, lb);
      return el;
    });

    // 刚抽的：先洗牌（中间一叠背面），再一张一张发到位置上
    if (fresh) {
      const cx = bw / 2 - cw / 2, cy = Math.min(parseFloat(board.style.height) / 2 - ch / 2, 120);
      const deck = h('div', { class: 'ta-deck', style: { left: cx + 'px', top: cy + 'px', width: cw + 'px', height: ch + 'px' } },
        [0, 1, 2, 3].map((k) => h('span', { class: 'ta-dk', style: { '--k': k }, html: TA.BACK })));
      board.append(deck);
      cards.forEach((el) => { el.classList.add('deal'); el.style.setProperty('--dx', cx - parseFloat(el.style.left) + 'px'); el.style.setProperty('--dy', cy - parseFloat(el.style.top) + 'px'); });
      board.querySelectorAll('.ta-pos').forEach((x) => x.classList.add('hide'));
      setTimeout(() => {
        cards.forEach((el, i) => setTimeout(() => { el.classList.remove('deal'); }, i * 150));
        setTimeout(() => { deck.classList.add('gone'); board.querySelectorAll('.ta-pos').forEach((x) => x.classList.remove('hide')); }, cards.length * 150 + 300);
        setTimeout(() => deck.remove(), cards.length * 150 + 800);
      }, 1100);
    }

    // 解牌那一块：解好的字 / 正在解 / 没解成 / 还没解（翻完了自己开始，旧的点「解牌」）
    function drawOut() {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec) return;
      out.innerHTML = '';
      const live = reading.get(id);
      if (rec.text || live != null) {
        out.append(...textEls(rec.text || live || ''));
        if (live != null) out.append(h('span', { class: 'dots3 ta-dots' }, h('i'), h('i'), h('i')));
        return;
      }
      if (flipped.size < rec.cards.length) return;
      if (rec.error) { out.append(h('button', { class: 'ch-err ta-err', text: `没解成：${rec.error}　点这里重试`, onclick: () => startRead() })); return; }
      out.append(h('button', { class: 'btn wide ta-go', text: '解牌', onclick: () => startRead() }));
    }
    async function startRead() {
      const rec = D.tarots().find((t) => t.id === id);
      if (!rec || rec.text || reading.has(id)) { drawOut(); return; }
      reading.set(id, '');
      drawOut();
      requestAnimationFrame(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      try {
        const text = await TA.read(rec, { onText: (t) => { reading.set(id, t); D.emit('tarotText', id); } });
        if (!text) throw new Error('这次是空的');
        D.saveTarot({ ...D.tarots().find((t) => t.id === id), text, error: '' });
      } catch (e) {
        const r = D.tarots().find((t) => t.id === id);
        if (r) D.saveTarot({ ...r, error: e.message || '出错了' });
      } finally {
        reading.delete(id);
        D.emit('tarotText', id);
      }
    }
    const offs2 = [D.on('tarotText', (x) => x === id && drawOut()), D.on('tarot', (x) => x === id && drawOut())];
    drawOut();
  }

  // 一张牌的大图
  function bigCard(c) {
    sheet({ title: c.pos, body: h('div', { class: 'ta-big' },
      h('span', { class: 'ta-big-c' + (c.up ? '' : ' rev'), html: TA.faceSvg(c.card) }),
      h('p', { text: `${c.card} · ${c.up ? '正位' : '逆位'} · ${TA.isMajor(c.card) ? '大阿卡纳' : '小阿卡纳'} · ${TA.elementOf(c.card)}` })) });
  }

  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}

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
