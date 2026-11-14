// 游戏：盒子里两样（你画我猜、海龟汤）。点一样 → 选怎么玩（我来画 / 他来画，他出题 / 一起猜）、选陪你玩的角色 → 进一局。
// 一局在这里自己的页面里玩：上面是画 / 汤面，下面是你们说的话，最底下输入框。不进聊天；
// 玩过的他都知道（聊天、写日记时，见 context.js 的 gameLine）。逻辑在 core/game.js。
// 主页面只有两张卡；右上角 ☰ = 玩过的（按游戏分组），点了接着看 / 接着玩，左滑 × 删。按身份分开。
import { h, Stack, page, icon, btnIc, sheet, swipeRow, avatar, autosize, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as G from '../../core/game.js';
import { GAME_NAME } from '../../core/prompt.js';
import { md, hm } from '../../core/time.js';

// 盒子里的画（原创线条）：画架上一道弯弯的线；一碗冒热气的汤，中间一个问号
const ART = {
  draw: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="46" height="36" rx="5"/><path d="M17 34c3-7 6-9 9-5s6 5 9-1 6-7 9-3 3.6 3.4 4.6 1.8"/><path d="M23 45l-5 10M41 45l5 10M32 45v5"/></svg>',
  soup: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 33h46c0 11.6-10.3 19-23 19S9 44.6 9 33z"/><path d="M22 57h20"/><path d="M21 25c-2.4-2.6 2.4-4.4 0-7.4M43 25c-2.4-2.6 2.4-4.4 0-7.4"/><path d="M28.4 15.4a3.8 3.8 0 1 1 5.2 3.5c-1.2.5-1.6 1.3-1.6 2.5v.8"/><circle cx="32" cy="26.4" r=".5" fill="currentColor"/></svg>',
};
const modeName = (g) => G.MODE_NAME[g.game]?.[g.mode] || '';

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '游戏', big: true, left: h('span'), right: btnIc('toc', () => openPast(), '玩过的') });
  pg.el.classList.add('gm');
  const boxes = h('div', { class: 'gm-box' }, ['draw', 'soup'].map((k) => h('button', { class: 'gm-tile', onclick: () => pick(k) },
    h('span', { class: 'gm-art', html: ART[k] }), h('b', { text: GAME_NAME[k] }))));
  pg.scroll.append(boxes);
  stack.root({ el: pg.el });

  // ── 右上角 ☰：玩过的，按游戏分两组（组里新的在上面），点了接着看 / 接着玩，左滑 × 删 ──
  function openPast() {
    const p = page({ title: '玩过的', onBack: () => stack.pop() });
    p.el.classList.add('gm');
    const past = h('div', { class: 'gm-past' });
    p.scroll.append(past);
    const draw = () => {
      past.innerHTML = '';
      const all = D.gamesOf().filter((g) => D.charById(g.char));
      if (!all.length) { past.append(h('div', { class: 'empty' }, h('b', { text: '还没有玩过' }))); return; }
      for (const k of ['draw', 'soup']) {
        const list = all.filter((g) => g.game === k);
        if (!list.length) continue;
        past.append(h('div', { class: 'gm-past-t', text: GAME_NAME[k] }));
        for (const g of list) {
          const c = D.charById(g.char);
          const it = h('button', { class: 'gm-it', onclick: () => openGame(g.id) },
            avatar(c.avatar, D.nameOf(c), 'sm'),
            h('div', { class: 'gm-it-t' }, h('b', { text: `${D.nameOf(c)} · ${modeName(g)}` }), h('small', { text: G.brief(g) })),
            h('small', { class: 'gm-it-d', text: `${md(g.lastTs || g.ts)} ${hm(g.lastTs || g.ts)}` }));
          past.append(swipeRow(it, () => G.remove(g.id), { icon: 'close' }));
        }
      }
    };
    let drawT = 0;
    const later = () => { clearTimeout(drawT); drawT = setTimeout(draw, 120); };
    const offs2 = [D.on('game', later), D.on('account', draw)];
    stack.push({ el: p.el, onShow: draw, onDestroy: () => { clearTimeout(drawT); offs2.forEach((f) => f()); } });
    draw();
  }

  // ── 选怎么玩、选谁陪你玩 ──
  function pick(game) {
    let mode = Object.keys(G.MODE_NAME[game])[0];
    const seg = h('div', { class: 'gm-seg' });
    const drawSeg = () => {
      seg.innerHTML = '';
      for (const [m, name] of Object.entries(G.MODE_NAME[game])) seg.append(h('button', { class: m === mode ? 'on' : '', text: name, onclick: () => { mode = m; drawSeg(); } }));
    };
    drawSeg();
    const list = h('div', { class: 'pick-list' });
    const chars = D.chars();
    if (!chars.length) list.append(h('div', { class: 'empty', text: '还没有角色' }));
    for (const c of chars) {
      list.append(h('button', { class: 'pick-it', onclick: () => { s.close(); const g = G.start(c.id, game, mode); setTimeout(() => openGame(g.id), 260); } },
        avatar(c.avatar, D.nameOf(c), 'sm'), h('span', { text: D.nameOf(c) })));
    }
    const s = sheet({ title: GAME_NAME[game], body: h('div', { class: 'gm-pick' }, seg, list) });
  }

  // ── 一局 ──
  function openGame(id0) {
    let id = id0;
    const g0 = D.gameById(id);
    if (!g0) return;
    const sub = h('small', { class: 'ch-sub' });
    const act = h('button', { class: 'ibtn' });
    const p = page({ title: GAME_NAME[g0.game], cls: 'chat gm-play', onBack: () => stack.pop(), right: [act] });
    const ttl = p.head.querySelector('.ttl');
    const tbox = h('div', { class: 'ch-ttl' });
    ttl.before(tbox);
    tbox.append(ttl, sub);
    const stage = h('div', { class: 'gm-stage' });
    const list = h('div', { class: 'ch-list gm-log' });
    p.scroll.classList.add('ch-scroll');
    p.scroll.append(stage, list);

    // 输入栏：输入框 + 发送（他正在说、框里没字的时候是停下）
    const ta = h('textarea', { class: 'ch-in', rows: 1, enterkeyhint: 'send' });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendBtn.click(); } });
    const fit = autosize(ta, 120);
    const sendBtn = h('button', { class: 'ch-send', 'aria-label': '发送' });
    const foot = h('div', { class: 'ch-foot' }, h('div', { class: 'ch-bar' }, ta, sendBtn));
    p.el.append(foot);
    ta.addEventListener('input', () => drawSend());
    ta.addEventListener('focus', () => setTimeout(() => toBottom(true), 300));
    sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    sendBtn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (text) { G.say(id, text); ta.value = ''; fit(); drawSend(); toBottom(true); return; }
      if (G.busy(id)) G.stop(id);
    });
    function drawSend() {
      const stop = G.busy(id) && !ta.value.trim();
      sendBtn.className = 'ch-send' + (stop ? ' stop' : ta.value.trim() ? ' go' : '');
      sendBtn.innerHTML = icon(stop ? 'stop' : 'send');
      sendBtn.setAttribute('aria-label', stop ? '停下' : '发送');
    }

    // 右上角：玩着的时候 = 不猜了 / 公布答案（先问一句）；玩完了 = 再来一局
    act.addEventListener('click', async () => {
      const g = D.gameById(id);
      if (!g) return;
      if (g.over) {
        const ng = G.start(g.char, g.game, g.mode);
        id = ng.id; padLines = []; stageSig = ''; ta.value = ''; fit();
        draw();
        return;
      }
      const giveUp = g.game === 'draw' && g.mode === 'me' ? '公布答案' : '不猜了';
      if (await confirm(giveUp + '？', '', giveUp)) G.giveUp(id);
    });

    // ── 上面那块：画板 / 画 / 汤面 ──
    let stageSig = '', padLines = [];
    function drawStage(g) {
      const sig = [g.id, g.lines?.length || 0, !!g.soup, g.over, G.busy(id), G.isHosting(id)].join('|');
      if (sig === stageSig) return;
      stageSig = sig;
      stage.innerHTML = '';
      stage.className = 'gm-stage';
      if (g.game === 'draw') {
        if (g.mode === 'me' && !g.lines?.length) { stage.append(pad(g)); return; }
        stage.classList.add('pin');
        const art = g.lines?.length ? h('div', { class: 'gm-drawing', html: G.drawSvg(g.lines) })
          : h('div', { class: 'gm-drawing none' }, G.busy(id) ? h('span', { class: 'dots3' }, h('i'), h('i'), h('i')) : h('span', { html: icon('brush') }));
        stage.append(art);
        if (g.ans && (g.mode === 'me' || g.over)) stage.append(h('div', { class: 'gm-ans-t' }, h('em', { text: '答案' }), g.ans));
        return;
      }
      // 海龟汤：汤面；汤底玩完了才露出来
      if (!g.soup) {
        stage.append(h('div', { class: 'card soup gm-soup wait' }, h('span', { class: 'dots3' }, h('i'), h('i'), h('i'))));
        return;
      }
      stage.append(h('div', { class: 'card soup gm-soup' + (g.over ? ' open' : '') },
        h('div', { class: 'sp-top' }, g.soup.title ? h('b', { text: g.soup.title }) : null, h('p', { text: g.soup.face })),
        h('div', { class: 'sp-foot' }, g.over ? h('p', {}, h('em', { text: '汤底' }), g.soup.bottom) : h('span', { class: 'sp-lock' }, h('span', { html: icon('lock') }), '汤底'))));
    }

    // 画板（我来画）：手指画，撤销一笔、全擦；写上画的是什么，发给他猜（坐标存成 0～100）
    function pad(g) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const el = document.createElementNS(svgNS, 'svg');
      el.setAttribute('viewBox', '0 0 100 100');
      el.setAttribute('class', 'dr-pad');
      const g0 = document.createElementNS(svgNS, 'g');
      for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) g0.setAttribute(k, v);
      el.append(g0);
      let cur = null;
      const ans = h('input', { class: 'gm-ans', enterkeyhint: 'done', 'aria-label': '画的是什么' });
      const redraw = () => {
        g0.innerHTML = padLines.map((l) => `<polyline points="${l.join(' ')}"/>`).join('');
        undoB.disabled = clearB.disabled = !padLines.length;
        goB.disabled = !padLines.length || !ans.value.trim();
      };
      const at = (e) => { const r = el.getBoundingClientRect(); return [Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 1000) / 10)), Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10))]; };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); ans.blur(); el.setPointerCapture(e.pointerId); cur = at(e); padLines.push(cur); redraw(); });
      el.addEventListener('pointermove', (e) => {
        if (!cur) return;
        const [x, y] = at(e), n = cur.length;
        if (Math.hypot(x - cur[n - 2], y - cur[n - 1]) < 1.2) return; // 太近的点不要
        cur.push(x, y); redraw();
      });
      const up = () => { if (cur && cur.length < 4) cur.push(cur[0] + 0.3, cur[1] + 0.3); cur = null; redraw(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      ans.addEventListener('input', redraw);
      ans.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) ans.blur(); });
      const undoB = h('button', { 'aria-label': '撤销一笔', html: icon('undo'), onclick: () => { padLines.pop(); redraw(); } });
      const clearB = h('button', { 'aria-label': '全擦掉', html: icon('trash'), onclick: () => { padLines.length = 0; redraw(); } });
      const goB = h('button', { class: 'go', 'aria-label': '画好了', html: icon('send'), onclick: () => {
        if (!padLines.length || !ans.value.trim()) return;
        const lines = padLines.map((l) => [...l]);
        padLines = [];
        G.sendDrawing(g.id, lines, ans.value.trim());
      } });
      const box = h('div', { class: 'dr-wrap gm-padw' }, el,
        h('label', { class: 'gm-ans-row' }, h('span', { text: '画的是' }), ans),
        h('div', { class: 'dr-bar' }, undoB, clearB, goB));
      redraw();
      return box;
    }

    // ── 下面：你们说的话。出题人 / 结果是一行小字；没回上的点了重试 ──
    function drawLog(g) {
      const c = D.charById(g.char), me = D.curAccount();
      const nearBottom = p.scroll.scrollHeight - p.scroll.scrollTop - p.scroll.clientHeight < 80;
      list.innerHTML = '';
      const av = (who) => (who === 'them' ? avatar(c?.avatar, D.nameOf(c), 'sm') : avatar(me.avatar, me.name, 'sm'));
      for (const e of g.log) {
        if (e.err) { list.append(h('button', { class: 'ch-err gm-err', text: `${e.text}　点这里重试`, onclick: () => G.retry(id) })); continue; }
        if (e.who === 'host' || e.who === 'sys') { list.append(h('div', { class: 'ch-note', text: e.text })); continue; }
        if (e.t === 'draw' || e.t === 'soup' || !e.text) continue; // 画、汤面在上面
        const bub = h('div', { class: 'bub' }, e.t === 'ask' ? h('em', { class: 'ask-t', text: '问' }) : null, e.text);
        const col = h('div', { class: 'bcol' }, bub);
        list.append(h('div', { class: 'rec ' + (e.who === 'me' ? 'me' : 'them') }, h('div', { class: 'ln' }, e.who === 'them' ? av('them') : null, col, e.who === 'me' ? av('me') : null)));
      }
      if (G.busy(id)) list.append(h('div', { class: 'rec them' }, h('div', { class: 'ln' }, av('them'), h('div', { class: 'bub typing' }, h('span', { class: 'dots3' }, h('i'), h('i'), h('i'))))));
      if (nearBottom) toBottom();
    }
    function toBottom(smooth) { requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })); }

    function draw() {
      const g = D.gameById(id);
      if (!g) { if (stack.top?.el === p.el) stack.pop(); return; }
      const c = D.charById(g.char);
      sub.textContent = G.busy(id) ? '对方正在输入…' : G.isJudging(id) || G.isHosting(id) ? '出题人在想…' : `${D.nameOf(c) || ''} · ${modeName(g)}`;
      const waitDraw = g.game === 'draw' && g.mode === 'me' && !g.lines?.length;
      act.hidden = waitDraw && !g.over;
      act.innerHTML = icon(g.over ? 'redo' : 'flag');
      act.setAttribute('aria-label', g.over ? '再来一局' : g.game === 'draw' && g.mode === 'me' ? '公布答案' : '不猜了');
      foot.hidden = waitDraw;
      drawStage(g);
      drawLog(g);
      drawSend();
    }
    const offs2 = [D.on('game', (x) => x === id && draw())];
    stack.push({ el: p.el, onShow: () => toBottom(), onDestroy: () => {
      offs2.forEach((f) => f());
      // 我来画、还没画就走了：这局不留
      const g = D.gameById(id);
      if (g && g.mode === 'me' && !g.lines?.length && !g.log.length) D.removeGame(id);
    } });
    draw();
    toBottom();
  }

  return { destroy: () => stack.destroyAll() };
}
