// 塔罗：一副 78 张牌、6 种牌阵、抽牌（照 Notion 资料库里 tarot-skill 的抽法：加权、不重复、正逆位、按时段偏一点，用 seed 能复现），
// 牌面（原创的黑白 SVG），解牌（中性的塔罗师口吻，提示词在 prompt.js 的 tarotPrompt）。
import * as D from './data.js';
import { chat } from './api.js';
import * as T from './prompt.js';
import { stripThink } from './parse.js';

export const MAJORS = '愚者 魔术师 女祭司 女皇 皇帝 教皇 恋人 战车 力量 隐士 命运之轮 正义 倒吊人 死神 节制 恶魔 高塔 星星 月亮 太阳 审判 世界'.split(' ');
const SUITS = { 权杖: '火', 圣杯: '水', 宝剑: '风', 星币: '土' };
const RANKS = '首牌 二 三 四 五 六 七 八 九 十 侍从 骑士 皇后 国王'.split(' ');
const MINORS = Object.keys(SUITS).flatMap((s) => RANKS.map((r) => s + r));
const MAJOR_EL = '风 风 水 土 火 土 风 水 火 土 火 风 水 水 火 土 火 风 水 火 火 土'.split(' ');
export const CARDS = [...MAJORS, ...MINORS];
export const elementOf = (c) => (MAJORS.includes(c) ? MAJOR_EL[MAJORS.indexOf(c)] : SUITS[c.slice(0, 2)]);
export const isMajor = (c) => MAJORS.includes(c);

// 牌阵：名字、每个位置（名字、要紧的位置大牌更容易出现、偏正位）、在桌上摆在哪（格子坐标，rot = 横着放）
export const SPREADS = {
  single: { name: '单张牌', pos: [['当前指引', 1, 0]], at: [[0, 0]] },
  three: { name: '三牌阵', pos: [['过去', 0, 0], ['现在', 1, 0], ['未来', 0, 1]], at: [[0, 0], [1, 0], [2, 0]] },
  diamond: { name: '五牌阵', pos: [['核心', 1, 0], ['根源', 0, 0], ['阻力', 0, 0], ['潜力', 0, 0], ['建议', 1, 1]], at: [[1, 1], [1, 2], [0, 1], [2, 1], [1, 0]] },
  moon: { name: '月亮牌阵', pos: [['新月', 1, 0], ['上弦', 0, 0], ['满月', 1, 0], ['下弦', 0, 0]], at: [[0, 0.5], [1, 0.12], [2, 0.12], [3, 0.5]] },
  horseshoe: { name: '马蹄形', pos: [['远期过去', 0, 0], ['近期过去', 0, 0], ['当前', 1, 0], ['近期未来', 0, 0], ['外部影响', 1, 0], ['建议', 0, 1], ['结果', 1, 1]], at: [[0, 0], [0.5, 1.05], [1, 2.1], [1.5, 3.15], [2, 2.1], [2.5, 1.05], [3, 0]], small: true },
  celtic: { name: '凯尔特十字', pos: [['核心', 1, 0], ['交叉', 0, 0], ['意识目标', 0, 0], ['根基过去', 0, 0], ['近期过去', 1, 0], ['近期未来', 0, 0], ['自我', 0, 0], ['环境', 0, 0], ['希望与恐惧', 0, 0], ['结果', 1, 1]],
    // 交叉那张横着压在核心下半截上（核心上半截露着，能点；位置名不写，压住了也看不见）
    at: [[1, 1.3], [1, 1.62, 1], [1, 0], [1, 2.6], [0, 1.3], [2, 1.3], [3.25, 2.95], [3.25, 1.97], [3.25, 0.99], [3.25, 0]], small: true, noLabel: [0, 1] },
};
const TIME = { morning: ['火', '风'], afternoon: ['水', '土'], night: ['major'] };
export const TIME_NAME = { morning: '上午', afternoon: '下午', night: '夜里' };
export const timeFactor = (hr = new Date().getHours()) => (hr >= 6 && hr < 12 ? 'morning' : hr >= 6 && hr < 18 ? 'afternoon' : 'night');

// 能复现的随机数（同一个 seed 抽出来的一样）
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeSeed(q = '') {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  let x = b[0] ^ Date.now();
  for (const ch of q) x = (Math.imul(x, 31) + ch.charCodeAt(0)) >>> 0;
  return (x ^ b[1]) >>> 0;
}
/** 抽：要紧的位置大牌权重高一些（60/28），这个时段的元素（夜里是大牌）再高一点点（×1.08）；抽过的不放回；正位概率 0.6（偏正位的位置 0.7） */
export function draw(spread, question = '', seed = null, tf = null) {
  const sp = SPREADS[spread];
  seed ??= makeSeed(question);
  tf ??= timeFactor();
  const r = rng(seed), pool = [...CARDS], boost = TIME[tf];
  const cards = sp.pos.map(([pos, key, up]) => {
    const w = pool.map((c) => (key && isMajor(c) ? 60 / 28 : 1) * ((boost.includes('major') && isMajor(c)) || boost.includes(elementOf(c)) ? 1.08 : 1));
    let x = r() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < pool.length - 1 && (x -= w[i]) > 0) i++;
    const card = pool.splice(i, 1)[0];
    return { pos, card, up: r() < (up ? 0.7 : 0.6) };
  });
  return { spread, seed, tf, cards };
}

/** 几张牌放在一起的大概样子：花色分布、大牌占多少（给解牌的模型看） */
export function stats(cards) {
  const n = cards.length, maj = cards.filter((c) => isMajor(c.card)).length;
  const suits = {};
  for (const c of cards) if (!isMajor(c.card)) suits[c.card.slice(0, 2)] = (suits[c.card.slice(0, 2)] || 0) + 1;
  const missing = Object.keys(SUITS).filter((s) => !suits[s]);
  return { n, maj, ratio: n ? Math.round((maj / n) * 100) : 0, suits, missing };
}

/**
 * 解牌：流式，onText(到现在的全文)。
 * 解得长（凯尔特十字十张牌），以前 token 上限给少了会写一半断掉，现在给到 7000。
 * 卡住了要停得下来：只有来了正文才算有动静（排队时的 keep-alive、推理模型想的那段都不算）——
 * 2 分半还没开始写、写了以后 45 秒没新字、或者总共过了 5 分钟，就停下（写了一半的留着，能接着解）。
 * part = 上次写了一半的：接着写，返回的是接上之后的全文
 */
export const LIMITS = { first: 150000, idle: 45000, timeout: 300000 };
// 界面上：正在解、这么久没来新字，点子下面出一个重试按钮（不自己停，推理模型想得久）
export const STALE = { ms: 20000 };
export async function read(rec, { onText, signal, part = '' } = {}) {
  const g = D.genOf({});
  const msgs = [{ role: 'user', content: readPrompt(rec) }];
  if (part) msgs.push({ role: 'assistant', content: part }, { role: 'user', content: T.tarotGoOn() });
  const join2 = (more) => (part ? part.replace(/\s+$/, '') + '\n' + more.replace(/^\s+/, '') : more);
  let got = '', why = '';
  try {
    await chat(msgs, {
      signal, ...LIMITS, temperature: Math.min(1, g.temperature), max_tokens: Math.max(7000, g.maxTokens),
      onEnd: (r) => { why = r; },
      onDelta: (_, all) => { got = stripThink(all); onText && onText(join2(got)); },
    });
  } catch (e) {
    e.part = join2(got).trim();
    throw e;
  }
  // 写到 token 上限被截断了：当成写了一半，能接着解
  if (why === 'length') { const err = new Error('写得太长被截断了'); err.part = join2(got).trim(); throw err; }
  return join2(got).trim();
}
function readPrompt(rec) {
  return T.tarotPrompt({ q: rec.q, spread: SPREADS[rec.spread].name, time: TIME_NAME[rec.tf], cards: rec.cards.map((c) => ({ ...c, el: elementOf(c.card), major: isMajor(c.card) })), stats: stats(rec.cards) });
}

// ── 追问：解完以后就这一局接着问（不带人设、记忆，只看这一局）。对话存在这一局的 chat 里：
//    [{ id, who: me/them/sys, text, ts, err（没回上的那一行，点了重试）}]，删这一局时一起没了 ──
const talks = new Map(); // 这一局 id → { ctrl, text, at（回复要插在第几条后面）}
const recOf = (id) => D.tarots().find((t) => t.id === id);
export const chatBusy = (id) => talks.has(id);
export const chatLive = (id) => { const j = talks.get(id); return j ? { text: j.text, at: j.at } : null; };
/** 你问一句。他正在回的话，回完接着回你这句 */
export function ask(id, text) {
  const rec = recOf(id);
  if (!rec?.text || !text) return;
  const log = (rec.chat || []).filter((m) => !m.err);
  log.push({ id: D.uid(), who: 'me', text, ts: Date.now() });
  D.saveTarot({ ...rec, chat: log });
  if (!talks.has(id)) talk(id);
}
/** 停下：已经写出来的留着 */
export const stopChat = (id) => talks.get(id)?.ctrl.abort();
/** 没回上 → 再来 */
export function retryChat(id) {
  const rec = recOf(id);
  if (!rec || talks.has(id)) return;
  const log = (rec.chat || []).filter((m) => !m.err);
  D.saveTarot({ ...rec, chat: log });
  if (log.at(-1)?.who === 'me') talk(id);
}
/** 解牌重来 / 删掉时：正在回的直接扔掉，不留东西 */
export function dropChat(id) {
  const j = talks.get(id);
  if (!j) return;
  talks.delete(id);
  j.ctrl.abort();
  D.emit('tarotChat', id);
}
async function talk(id) {
  const rec = recOf(id);
  if (!rec?.text) return;
  const log = (rec.chat || []).filter((m) => !m.err);
  const job = { ctrl: new AbortController(), text: '', at: log.length };
  talks.set(id, job);
  D.emit('tarotChat', id);
  const g = D.genOf({});
  const msgs = [
    { role: 'system', content: T.tarotChatSystem({ q: rec.q, spread: SPREADS[rec.spread].name, time: TIME_NAME[rec.tf], cards: rec.cards, text: rec.text }) },
    ...log.map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text })),
  ];
  let err = null;
  try {
    await chat(msgs, {
      signal: job.ctrl.signal, ...LIMITS, temperature: Math.min(1, g.temperature), max_tokens: Math.max(2000, g.maxTokens),
      onDelta: (_, all) => { job.text = stripThink(all); D.emit('tarotChat', id); },
    });
  } catch (e) { if (e.name !== 'AbortError') err = e; }
  if (talks.get(id) !== job) return; // 中途被扔掉了（重解、删除）
  talks.delete(id);
  const r = recOf(id);
  if (!r) { D.emit('tarotChat', id); return; }
  const list = (r.chat || []).slice();
  const said = job.text.trim();
  // 没回上：写了一半的不留（重试会整句重来）；你点了停下：写出来的留着
  if (said && !err) list.splice(Math.min(job.at, list.length), 0, { id: D.uid(), who: 'them', text: said, ts: Date.now() });
  if (err) list.push({ id: D.uid(), who: 'sys', err: true, text: '没回上：' + (err.message || '出错了'), ts: Date.now() });
  D.saveTarot({ ...r, chat: list });
  D.emit('tarotChat', id);
  // 他回的时候你又问了：接着回
  if (!err && !job.ctrl.signal.aborted && list.filter((m) => !m.err).at(-1)?.who === 'me') talk(id);
}

// ── 牌面：黑白，边框 + 编号 + 中间一个图案 + 牌名。大牌每张一个小图案，小牌是花色符号（数字牌按数量排，宫廷牌写字） ──
const SW = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const MAJOR_ART = [
  '<circle cx="50" cy="56" r="13" ' + SW + '/><path d="M30 92l40-6M58 30l10-12" ' + SW + '/>', // 愚者：一个圆（零）、路、行囊的杆
  '<path d="M30 70c0-10 16-10 20 0s20 10 20 0-16-10-20 0-20 10-20 0z" ' + SW + '/><path d="M50 38v-12M44 32h12" ' + SW + '/>', // 魔术师：∞
  '<path d="M34 34v56M66 34v56M28 34h12M60 34h12" ' + SW + '/><path d="M56 56a9 9 0 1 1-6-14 7 7 0 1 0 6 14z" fill="currentColor"/>', // 女祭司：两根柱子、月
  '<circle cx="50" cy="52" r="13" ' + SW + '/><path d="M50 65v24M40 78h20" ' + SW + '/>', // 女皇：♀
  '<rect x="32" y="40" width="36" height="40" ' + SW + '/><path d="M32 52h36M50 40v40M38 40l-6-8M62 40l6-8" ' + SW + '/>', // 皇帝：宝座
  '<path d="M50 30v62M38 42h24M34 54h32M40 66h20" ' + SW + '/>', // 教皇：三重十字
  '<circle cx="41" cy="60" r="13" ' + SW + '/><circle cx="59" cy="60" r="13" ' + SW + '/><path d="M50 36l4-6 4 6" ' + SW + '/>', // 恋人：两个圆
  '<rect x="32" y="44" width="36" height="26" ' + SW + '/><circle cx="36" cy="78" r="7" ' + SW + '/><circle cx="64" cy="78" r="7" ' + SW + '/><path d="M50 44v-12" ' + SW + '/>', // 战车
  '<circle cx="50" cy="64" r="14" ' + SW + '/><path d="M36 40c0-8 10-8 14 0s14 8 14 0-10-8-14 0-14 8-14 0z" ' + SW + '/>', // 力量：∞ 在上面
  '<path d="M42 44h16l4 26H38z" ' + SW + '/><path d="M50 34v10M46 84h8M50 70v14" ' + SW + '/><path d="M50 50l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="currentColor"/>', // 隐士：灯
  '<circle cx="50" cy="60" r="20" ' + SW + '/><circle cx="50" cy="60" r="5" ' + SW + '/><path d="M50 40v40M30 60h40M36 46l28 28M64 46L36 74" ' + SW + '/>', // 命运之轮
  '<path d="M50 32v58M34 46h32M40 90h20" ' + SW + '/><path d="M34 46l-8 18h16zM66 46l-8 18h16z" ' + SW + '/>', // 正义：天平
  '<path d="M34 34h32M50 34v28" ' + SW + '/><circle cx="50" cy="74" r="10" ' + SW + '/><path d="M42 50h16" ' + SW + '/>', // 倒吊人
  '<path d="M38 88l22-56" ' + SW + '/><path d="M60 32c14 2 22 14 18 28-6-10-12-14-22-16" ' + SW + '/>', // 死神：镰刀
  '<path d="M30 44h14l-2 12h-10zM56 66h14l-2 12h-10z" ' + SW + '/><path d="M40 56c6 4 14 6 22 10" ' + SW + ' stroke-dasharray="2 4"/>', // 节制：两个杯子倒水
  '<path d="M50 84L38 48h24zM40 58l20 0M44 70h12" ' + SW + '/><path d="M36 40l6 8M64 40l-6 8" ' + SW + '/>', // 恶魔：倒五角
  '<path d="M38 90V44l12-10 12 10v46" ' + SW + '/><path d="M58 22l-8 16h8l-8 16" ' + SW + '/><path d="M46 60h8v10h-8z" ' + SW + '/>', // 高塔：闪电
  '<path d="M50 34l5 17 17 0-14 10 5 17-13-10-13 10 5-17-14-10 17 0z" ' + SW + '/><circle cx="30" cy="84" r="2" fill="currentColor"/><circle cx="72" cy="86" r="2" fill="currentColor"/>', // 星星
  '<path d="M60 38a22 22 0 1 0 0 44 18 18 0 1 1 0-44z" ' + SW + '/>', // 月亮
  '<circle cx="50" cy="60" r="12" ' + SW + '/><path d="M50 36v8M50 76v8M26 60h8M66 60h8M33 43l6 6M61 71l6 6M33 77l6-6M61 49l6-6" ' + SW + '/>', // 太阳
  '<path d="M34 72l30-30 4 18z" ' + SW + '/><path d="M40 82h20M44 88h12" ' + SW + '/>', // 审判：号角
  '<ellipse cx="50" cy="60" rx="17" ry="26" ' + SW + '/><circle cx="30" cy="36" r="2.4" fill="currentColor"/><circle cx="70" cy="36" r="2.4" fill="currentColor"/><circle cx="30" cy="86" r="2.4" fill="currentColor"/><circle cx="70" cy="86" r="2.4" fill="currentColor"/>', // 世界：花环
];
// 花色符号（以 0,0 为中心，大概 16 宽）
const SUIT_ART = {
  权杖: '<path d="M0 -12v24M-3 -9l3-4 3 4" ' + SW + '/>',
  圣杯: '<path d="M-7 -9h14c0 8-3 11-7 11s-7-3-7-11zM0 2v7M-5 10h10" ' + SW + '/>',
  宝剑: '<path d="M0 -12v18M-5 6h10M0 6v6" ' + SW + '/>',
  星币: '<circle r="8" ' + SW + '/><path d="M0 -5l1.5 3.5h3.5l-3 2.2 1.2 3.6-3.2-2.3-3.2 2.3 1.2-3.6-3-2.2h3.5z" fill="currentColor"/>',
};
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
// 数字牌：符号按几个排
const PIPS = { 1: [[50, 60]], 2: [[50, 44], [50, 76]], 3: [[50, 40], [50, 60], [50, 80]], 4: [[38, 46], [62, 46], [38, 74], [62, 74]], 5: [[38, 44], [62, 44], [50, 60], [38, 76], [62, 76]],
  6: [[38, 42], [62, 42], [38, 60], [62, 60], [38, 78], [62, 78]], 7: [[38, 40], [62, 40], [50, 52], [38, 64], [62, 64], [38, 82], [62, 82]],
  8: [[38, 38], [62, 38], [38, 52], [62, 52], [38, 68], [62, 68], [38, 82], [62, 82]], 9: [[38, 38], [62, 38], [38, 52], [62, 52], [50, 60], [38, 68], [62, 68], [38, 82], [62, 82]],
  10: [[38, 36], [62, 36], [50, 45], [38, 54], [62, 54], [38, 66], [62, 66], [50, 75], [38, 84], [62, 84]] };
const COURT = { 侍从: '侍', 骑士: '骑', 皇后: '后', 国王: '王' };

/** 一张牌的正面（SVG 字符串）。viewBox 100×160 */
export function faceSvg(card) {
  let art = '', top = '';
  if (isMajor(card)) {
    const i = MAJORS.indexOf(card);
    art = `<g transform="translate(0 6)">${MAJOR_ART[i]}</g>`;
    top = ROMAN[i];
  } else {
    const suit = card.slice(0, 2), rank = card.slice(2), n = RANKS.indexOf(rank) + 1;
    if (n <= 10) {
      const s = n === 1 ? 2 : n <= 3 ? 1.15 : 0.85;
      art = PIPS[n].map(([x, y]) => `<g transform="translate(${x} ${y + 6}) scale(${s})">${SUIT_ART[suit]}</g>`).join('');
      top = n === 1 ? 'A' : String(n);
    } else {
      art = `<g transform="translate(50 52) scale(1.4)">${SUIT_ART[suit]}</g><text x="50" y="96" text-anchor="middle" font-size="22" font-family="serif" fill="currentColor">${COURT[rank]}</text>`;
      top = COURT[rank];
    }
  }
  return `<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="98" height="158" rx="7" fill="#FBFAF6"/><rect x="6" y="6" width="88" height="148" rx="4" fill="none" stroke="currentColor" stroke-width="1"/><rect x="9" y="9" width="82" height="142" rx="3" fill="none" stroke="currentColor" stroke-width=".5"/>
<text x="50" y="26" text-anchor="middle" font-size="12" font-family="serif" letter-spacing="1" fill="currentColor">${top}</text>
${art}
<line x1="22" y1="118" x2="78" y2="118" stroke="currentColor" stroke-width=".6"/><text x="50" y="138" text-anchor="middle" font-size="${card.length > 4 ? 11 : 13}" font-family="serif" fill="currentColor">${card}</text></svg>`;
}
/** 牌背：黑底，白色细线的图案 */
export const BACK = `<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="98" height="158" rx="7" fill="#161617"/><rect x="7" y="7" width="86" height="146" rx="4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".8"/>
<path d="M50 22L82 80 50 138 18 80z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/><path d="M50 40L72 80 50 120 28 80z" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width=".8"/>
<path d="M50 66l3.5 10 10.5 0-8.5 6 3.2 10-8.7-6.2-8.7 6.2 3.2-10-8.5-6 10.5 0z" fill="#fff" fill-opacity=".85"/>
<circle cx="50" cy="22" r="1.6" fill="#fff"/><circle cx="50" cy="138" r="1.6" fill="#fff"/><circle cx="18" cy="80" r="1.6" fill="#fff"/><circle cx="82" cy="80" r="1.6" fill="#fff"/></svg>`;
