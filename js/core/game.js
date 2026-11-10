// 游戏 App 的逻辑（跟聊天分开，在游戏自己的页面里玩；玩完陪你玩的那个角色聊天、写日记时知道，见 context.js 的 gameLine）。
//   你画我猜：me = 你画他猜（你写好答案，他说中了自动算赢）；him = 他画你猜（他用 [画 答案] 线条 画，你说中了自动算赢，他也能写 [猜对了]）
//   海龟汤：him = 他出题（[海龟汤 汤底：…] 汤面，他按汤底答是非，[猜对了] 算你赢）；
//           coop = 一起猜：看不见的出题人出题（hostSoup），你说的每句、他 [问] 的每句都给出题人判（judge），回答是一行小字
// 一局存在 data.js 的 games 里；他说的话一条一条冒出来（跟聊天一样）。
import * as D from './data.js';
import { chat } from './api.js';
import * as T from './prompt.js';
import * as C from './context.js';
import { parseJSON, normLines, drawGrid, parseLine, stripThink, partPreview } from './parse.js';
export { normLines, drawGrid };

/** 画 → SVG */
export const drawSvg = (lines) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${(lines || []).map((s) => `<polyline points="${s.join(' ')}"/>`).join('')}</g></svg>`;

/** 聊天里以前玩过的海龟汤（第六版放在聊天里的）：长按翻开汤底 */
export function reveal(cid, p, text) {
  if (!p || p.revealed) return;
  p.revealed = true;
  D.touchMsgs(cid);
  if (text) D.addMsg(cid, { role: 'note', alts: [[{ t: 'note', text }]] });
}

export const MODE_NAME = { draw: { me: '我来画', him: '他来画' }, soup: { him: '他出题', coop: '一起猜' } };
const meOf = (g) => D.accounts().find((a) => a.id === g.acc)?.name || '我';
const norm = (s) => String(s || '').toLowerCase().replace(/[\s，。！？、,.!?~～「」“”"'…]/g, '');
/** 说中了没有：话里有答案这几个字 */
const hits = (text, ans) => !!norm(ans) && norm(text).includes(norm(ans));

const running = new Map(); // 局 id → 他正在说
const judging = new Map(); // 局 id → 出题人正在判
export const busy = (id) => running.has(id);
export const isJudging = (id) => judging.has(id);

function push(g, e) { g.log.push({ id: D.uid(), ts: Date.now(), ...e }); g.lastTs = Date.now(); D.saveGame(g); }
const fresh = (id) => D.gameById(id);

/** 开一局（马上返回；一起猜要先等出题人出题，他画 / 他出题 / 一起猜是他先开口） */
export function start(cid, game, mode) {
  const g = D.saveGame({ id: D.uid(), acc: D.charById(cid)?.acc || D.curAccount().id, char: cid, game, mode, ts: Date.now(), lastTs: Date.now(), over: false, win: null, log: [] });
  if (game === 'soup' && mode === 'coop') prepSoup(g.id);
  else if (mode !== 'me') turn(g.id);
  return g;
}
const hosting = new Set();
export const isHosting = (id) => hosting.has(id);
async function prepSoup(id) {
  hosting.add(id);
  D.emit('game', id);
  try {
    const soup = await hostSoup();
    const g = fresh(id);
    if (!g) return;
    g.soup = soup;
    D.saveGame(g);
  } catch (e) {
    const g = fresh(id);
    if (g) push(g, { who: 'sys', err: 'host', text: '出题人没出好题：' + (e.message || '出错了') });
    return;
  } finally { hosting.delete(id); D.emit('game', id); }
  turn(id);
}
/** 没回上的那一下，再来一次（出题 / 判 / 他说话） */
export function retry(id) {
  const g = fresh(id);
  if (!g || busy(id) || hosting.has(id) || judging.has(id)) return;
  const e = [...g.log].reverse().find((x) => x.err);
  g.log = g.log.filter((x) => !x.err);
  D.saveGame(g);
  if (e?.err === 'host' || (g.game === 'soup' && g.mode === 'coop' && !g.soup)) prepSoup(id);
  else if (e?.err === 'judge') judgeLine(id, e.by, e.q).then(() => { if (e.by === meOf(g)) turn(id); });
  else turn(id);
}

/** 你画好了（你画他猜）：ans = 画的是什么 */
export async function sendDrawing(id, lines, ans) {
  const g = fresh(id);
  if (!g) return;
  g.lines = lines; g.ans = ans;
  push(g, { who: 'me', t: 'draw', lines });
  await turn(id);
}

/** 你说一句 */
export async function say(id, text) {
  let g = fresh(id);
  if (!g || !text) return;
  push(g, { who: 'me', text });
  if (!g.over && g.game === 'soup' && g.mode === 'coop') await judgeLine(id, meOf(g), text);
  g = fresh(id);
  // 他画你猜：你说中了就算你赢
  if (!g.over && g.game === 'draw' && g.mode === 'him' && g.lines?.length && hits(text, g.ans)) end(g, 'me', `猜中了，是「${g.ans}」`);
  if (!running.has(id)) await turn(id);
}

/** 不猜了 / 公布答案 */
export async function giveUp(id) {
  const g = fresh(id);
  if (!g || g.over) return;
  const me = meOf(g);
  const text = g.game === 'draw' ? (g.mode === 'me' ? `${me}公布了答案：「${g.ans}」` : `${me}不猜了，答案是「${g.ans}」`)
    : g.mode === 'coop' ? '出题人公布了汤底' : `${me}不猜了`;
  end(g, null, text);
  await turn(id);
}
function end(g, win, text) {
  g.over = true; g.win = win;
  push(g, { who: g.mode === 'coop' && g.game === 'soup' ? 'host' : 'sys', text });
}

// 一条一条放：第一条马上出，后面按字数等一会儿（跟聊天一样）
const gap = (s) => Math.max(600, Math.min(2400, 420 + String(s || '').length * 55));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 他说话（一轮）。回复里的 [画]、[海龟汤]、[猜对了]、[问] 在这里处理 */
export async function turn(id) {
  if (running.has(id)) return;
  const t0 = Date.now();
  let g = fresh(id);
  const c = g && D.charById(g.char);
  if (!c) return;
  const ctrl = new AbortController();
  running.set(id, ctrl);
  D.emit('game', id);
  const asks = [];
  try {
    const gen = D.genOf(c);
    const text = stripThink(await chat(C.buildGame(c, g), { signal: ctrl.signal, temperature: gen.temperature, max_tokens: Math.max(1500, gen.maxTokens), stream: false }));
    let first = true;
    for (const line of text.split('\n')) {
      const p = parseLine(line);
      if (!p) continue;
      g = fresh(id);
      if (!g) return;
      let e = null;
      if (p.t === 'draw') {
        // 他画的（只认第一幅）
        if (g.game === 'draw' && g.mode === 'him' && !g.lines?.length && p.lines.length) { g.lines = p.lines; g.ans = p.ans; e = { who: 'them', t: 'draw', lines: p.lines }; }
      } else if (p.t === 'soup') {
        if (g.game === 'soup' && g.mode === 'him' && !g.soup) { g.soup = { face: p.face, bottom: p.bottom }; e = { who: 'them', t: 'soup' }; }
      } else if (p.act === 'win') {
        if (!g.over && g.mode === 'him') { end(g, 'me', g.game === 'draw' ? `猜中了，是「${g.ans}」` : '猜中了'); continue; }
      } else if (p.act === 'reveal') {
        if (!g.over && g.game === 'soup' && g.mode === 'him') { end(g, null, '他讲了汤底'); continue; }
      } else if (p.t === 'ask') {
        e = { who: 'them', t: 'ask', text: p.text };
        if (g.game === 'soup' && g.mode === 'coop') asks.push(p.text);
      } else if (!p.act) {
        const s = p.t === 'text' ? p.text : partPreview(p);
        if (s) e = { who: 'them', text: s };
      }
      if (!e) continue;
      if (!first) await wait(gap(e.text));
      first = false;
      if (ctrl.signal.aborted) return;
      g = fresh(id);
      if (!g) return;
      push(g, e);
      // 你画他猜：他说中了就算他赢
      if (!g.over && g.game === 'draw' && g.mode === 'me' && e.text && hits(e.text, g.ans)) end(g, 'them', `猜中了，是「${g.ans}」`);
    }
  } catch (e) {
    if (e.name !== 'AbortError') { const g2 = fresh(id); if (g2) push(g2, { who: 'sys', err: 'turn', text: '没回上：' + (e.message || '出错了') }); }
  } finally {
    running.delete(id);
    D.emit('game', id);
  }
  // 一起猜：他问出题人的，一个个判
  for (const q of asks) { const g3 = fresh(id); if (!g3 || g3.over) break; await judgeLine(id, D.charById(g3.char)?.name || '他', q); }
  // 他说的时候你又说了：接着回你
  const g4 = fresh(id);
  if (g4 && !ctrl.signal.aborted && g4.log.some((e) => e.who === 'me' && e.ts > t0)) setTimeout(() => turn(id), 600);
}
export const stop = (id) => running.get(id)?.abort();

// ── 一起猜：看不见的出题人 ──
async function judgeLine(id, who, text) {
  const g = fresh(id);
  if (!g?.soup || g.over) return;
  judging.set(id, true);
  D.emit('game', id);
  try {
    const hist = g.log.filter((e) => e.who === 'host' || e.t === 'ask' || (e.who === 'me' && e.text)).slice(-40)
      .map((e) => (e.who === 'host' ? e.text : `${e.who === 'me' ? meOf(g) : D.charById(g.char)?.name || '他'}：${e.text}`)).join('\n');
    const r = await judge(g.soup, hist, who, text);
    const g2 = fresh(id);
    if (!g2 || g2.over || r.kind === 'chat') return;
    if (r.kind === 'giveup') { end(g2, null, '出题人公布了汤底'); return; }
    if (r.kind === 'guess' && r.solved) { end(g2, who === meOf(g2) ? 'me' : 'them', `出题人：${who}猜中了`); return; }
    push(g2, { who: 'host', text: `出题人回${who}：${r.answer || (r.kind === 'guess' ? '不对' : '无关')}` });
  } catch (e) {
    const g2 = fresh(id);
    if (g2) push(g2, { who: 'sys', err: 'judge', by: who, q: text, text: '出题人没回上：' + (e.message || '出错了') });
  } finally { judging.delete(id); D.emit('game', id); }
}
export async function hostSoup() {
  const text = await chat([{ role: 'user', content: T.soupHostPrompt() }], { temperature: 1, max_tokens: 900, stream: false });
  const j = parseJSON(text);
  if (!j?.face || !j?.bottom) throw new Error('再试一次');
  return { title: String(j.title || '').slice(0, 20), face: String(j.face), bottom: String(j.bottom), keys: (j.keys || []).map(String).slice(0, 6) };
}
async function judge(soup, history, who, text) {
  const out = await chat([{ role: 'user', content: T.soupJudgePrompt({ soup, history, who, text }) }], { temperature: 0.2, max_tokens: 300, stream: false });
  const j = parseJSON(out) || {};
  return { kind: ['ask', 'guess', 'giveup', 'chat'].includes(j.kind) ? j.kind : 'chat', answer: String(j.answer || '').slice(0, 12), solved: !!j.solved };
}

/** 列表里那一句（你这边看） */
export function brief(g) {
  const he = D.nameOf(D.charById(g.char)) || '他';
  const end = (mine, his, none) => (g.win === 'me' ? mine : g.win === 'them' ? his : g.over ? none : '没玩完');
  if (g.game === 'draw') {
    return g.mode === 'me' ? (g.ans ? `你画「${g.ans}」 · ` : '') + end('', `${he}猜中了`, `${he}没猜中`)
      : (g.over && g.ans ? `${he}画「${g.ans}」 · ` : '') + end('你猜中了', '', '你没猜中');
  }
  return end(g.mode === 'coop' ? '你先猜中了' : '你猜中了', `${he}先猜中了`, '没猜出来') + (g.soup ? ` · ${g.soup.face}` : '');
}
/** 删一局：他正在说的停下 */
export function remove(id) { stop(id); D.removeGame(id); }
