// 一起玩（聊天加号里）：你画我猜、海龟汤。
// 你画我猜：你画 → 发给他（他看到的是字符网格）猜；或者请他画 → 他用 [画 答案] 线条 画出来，你猜（答案不显示）。
// 海龟汤：他出题（[海龟汤 汤底：…] 汤面，汤底不显示，他按汤底答是非，[揭晓] 公布）；
//         或者你俩一起猜：看不见的出题人出题（单独一次调用），你们每问一句，出题人在下面答「是 / 不是 / 无关」，他问用 [问]。
// 聊天格式、写给他看的样子在 parse.js；什么时候提醒他规矩在 context.js（gameOf → prompt.js 的 gameHint）。
import * as D from './data.js';
import { chat } from './api.js';
import * as T from './prompt.js';
import { parseJSON, normLines, drawGrid } from './parse.js';
export { normLines, drawGrid };

/** 画 → SVG（聊天气泡里） */
export const drawSvg = (lines) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${(lines || []).map((s) => `<polyline points="${s.join(' ')}"/>`).join('')}</g></svg>`;
// ── 现在在玩什么（看最近的聊天记录）──
// 返回 { kind: 'draw-me'（你画了他猜）| 'draw-ask'（请他画）| 'draw-him'（他画了你猜）| 'soup-ask'（请他出题）| 'soup-host'（他出的题）| 'soup-coop'（一起猜）, … } 或 null
export function gameOf(list) {
  const recent = list.slice(-30);
  for (let i = recent.length - 1; i >= 0; i--) {
    const r = recent[i], ps = D.partsOf(r);
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      if (p.t === 'soup') return p.revealed ? null : { kind: p.by === 'host' ? 'soup-coop' : 'soup-host', soup: p, rec: r };
      if (p.t === 'draw') return p.by === 'me' ? (recent.length - i <= 12 ? { kind: 'draw-me' } : null) : { kind: 'draw-him', ans: p.ans || '' };
      if (p.t === 'game') return p.kind === 'draw' ? { kind: 'draw-ask' } : p.kind === 'soup-host' ? { kind: 'soup-ask' } : null;
    }
  }
  return null;
}
/** 这个对话里还没揭晓的那碗汤 */
export const soupOf = (cid) => { const g = gameOf(D.msgs(cid)); return g?.soup ? g : null; };

/** 揭晓：汤底露出来（他 [揭晓]、你长按翻开、一起猜时猜中或认输），下面跟一行小字 */
export function reveal(cid, p, text) {
  if (!p || p.revealed) return;
  p.revealed = true;
  D.touchMsgs(cid);
  if (text) D.addMsg(cid, { role: 'note', alts: [[{ t: 'note', text }]] });
}

// ── 一起猜：看不见的出题人 ──
export async function hostSoup() {
  const text = await chat([{ role: 'user', content: T.soupHostPrompt() }], { temperature: 1, max_tokens: 900, stream: false });
  const j = parseJSON(text);
  if (!j?.face || !j?.bottom) throw new Error('出题人没出好题，再试一次');
  return { t: 'soup', by: 'host', title: String(j.title || '').slice(0, 20), face: String(j.face), bottom: String(j.bottom), keys: (j.keys || []).map(String).slice(0, 6), revealed: false };
}
/** 出题人判一句话：{ kind: 'ask'|'guess'|'giveup'|'chat', answer, solved } */
export async function judge(soup, history, who, text) {
  const out = await chat([{ role: 'user', content: T.soupJudgePrompt({ soup, history, who, text }) }], { temperature: 0.2, max_tokens: 300, stream: false });
  const j = parseJSON(out) || {};
  return { kind: ['ask', 'guess', 'giveup', 'chat'].includes(j.kind) ? j.kind : 'chat', answer: String(j.answer || '').slice(0, 12), solved: !!j.solved };
}
