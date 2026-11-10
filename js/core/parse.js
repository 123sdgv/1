// 把模型的回复拆成一个个部件，以及反过来把记录写回成模型看得懂的文字。
// 聊天格式（每行一条消息）：
//   普通文字
//   [图片] 画面描述
//   [语音] 说的话
//   [引用 原话片段] 回复
//   [表情包 名字]
//   [转账 520] 备注
//   [收下转账] [退还转账]                —— 处理你转给他的
//   [日程 2026-11-20] 事情   [日程 每年 11-20] 事情   —— 往日历里记一件事
//   [动态] 内容                          —— 他发一条动态（不出现在聊天里）
//   [邮件 主题] 另起几行写正文，最后 [/邮件]   —— 他给你发一封邮件（不出现在聊天里）
//   [搜索 关键词]                         —— 他想查点东西（设了搜索才有）：搜完把结果给他，再接着回
//   [撤回]                                —— 他撤回自己刚发的上一条（也认 [撤回 那条里的几个字]）。撤回的那条变成部件
//                                            { t: 'recall', by: 'me'|'them', was: 原来的部件 }，聊天里只显示一行「X 撤回了一条消息」
//   一起玩（core/game.js）：
//   [画 答案] {"lines":[[x,y,x,y…]…]}       —— 你画我猜，他画一幅（答案不显示）→ { t: 'draw', by: 'them', ans, lines }；你画的是 by: 'me'
//   [海龟汤 汤底：真相] 汤面                —— 他出一道海龟汤（汤底不显示）→ { t: 'soup', by: 'them', face, bottom, revealed }；一起猜时出题人出的是 by: 'host'
//   [揭晓]                                —— 他公布汤底（动作）
//   [问] 是非题                            —— 一起猜海龟汤时他问出题人 → { t: 'ask', text }
//   你发的邀请 { t: 'game', kind: 'draw'（请他画）| 'soup-host'（请他出题）}
import { stickerByName } from './data.js';

export const stripThink = (s) => String(s || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/^\s*<\/think>/i, '');

// [标签 参数] 后面的话。标签不含空格、数字、冒号；参数是括号里剩下的
const TAG = /^[\[【]\s*([^\]】\s\d:：]+)\s*[:：]?\s*([^\]】]*?)\s*[\]】]\s*(.*)$/;
const money = (s, d) => { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : d; };
const pad = (n) => String(n).padStart(2, '0');
const QUOTE_MAX = 60;

/** 「2026-11-20」「11月20日」「11-20」「明天」→ YYYY-MM-DD；认不出返回 null */
export function parseDate(s) {
  const t = new Date();
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  s = String(s || '').trim();
  const rel = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[s];
  if (rel != null) return ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + rel));
  let m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (m) {
    let d = `${t.getFullYear()}-${pad(m[1])}-${pad(m[2])}`;
    if (d < ymd(t)) d = `${t.getFullYear() + 1}-${pad(m[1])}-${pad(m[2])}`;
    return d;
  }
  return null;
}

const voiceSec = (text) => Math.max(1, Math.min(60, Math.round(String(text).length / 3.6)));
export const makeVoice = (text) => ({ t: 'voice', text, sec: voiceSec(text) });

/** 一行 → 部件（或动作）。返回 null 表示这行不要 */
export function parseLine(line) {
  let s = line.trim();
  if (!s) return null;
  // 去掉模型偶尔带上的「12:30」前缀
  s = s.replace(/^\[?\d{1,2}:\d{2}\]?\s*/, '');
  const m = s.match(TAG);
  if (m) {
    const [, tag, arg, rest] = m.map((x) => (x || '').trim());
    if (/^(图片|照片|图)$/.test(tag)) return rest || arg ? { t: 'photo', desc: rest || arg } : null;
    // 老格式 [语音 语气] 话：语气不要了，只留话
    if (/^(语音|语音条)$/.test(tag)) return rest ? makeVoice(rest) : arg ? makeVoice(arg) : null;
    if (/^(表情包|表情|贴纸)$/.test(tag)) {
      const name = arg || rest;
      if (!name) return null;
      const st = stickerByName(name);
      return { t: 'sticker', name: st ? st.name : name };
    }
    if (/^(引用|回复)$/.test(tag) && arg) {
      const inner = parseLine(rest) || { t: 'text', text: rest };
      if (inner.act || !rest) return { t: 'text', text: s };
      return { ...inner, quote: { who: null, text: arg.slice(0, QUOTE_MAX) } };
    }
    if (/^(转账|红包)$/.test(tag)) return { t: 'pay', amount: money(arg, 52), note: rest, state: 'wait' };
    if (/^(收下转账|收款|接收转账|领取红包|领红包)$/.test(tag)) return { act: 'takePay' };
    if (/^(退还转账|退回转账|退款)$/.test(tag)) return { act: 'backPay' };
    if (/^(日程|记日程|日历|纪念日|提醒)$/.test(tag)) {
      const yearly = tag === '纪念日' || /每年/.test(arg);
      const date = parseDate(arg.replace('每年', ''));
      if (date && rest) return { t: 'event', date, title: rest.slice(0, 40), yearly };
      return { t: 'text', text: s };
    }
    if (/^(动态|发动态|说说)$/.test(tag)) return rest || arg ? { act: 'post', text: rest || arg } : null;
    if (/^(邮件|发邮件|写信|信)$/.test(tag)) return { act: 'mail', subject: arg.slice(0, 60), body: rest };
    if (/^(撤回|撤回消息|撤回上一条)$/.test(tag)) return { act: 'recall', q: (arg || rest).replace(/^[「“"']+|[」”"']+$/g, '').slice(0, 30) };
    if (/^(搜索|搜|查|查一下|联网搜索)$/.test(tag)) { const q = (arg + ' ' + rest).trim(); return q ? { act: 'search', q: q.slice(0, 80) } : null; }
    // 一起玩
    if (/^(画|画画|作画)$/.test(tag)) {
      let lines = [];
      const a = rest.indexOf('{'), b = rest.lastIndexOf('}'), a2 = rest.indexOf('[');
      try { lines = normLines(a >= 0 && b > a ? JSON.parse(rest.slice(a, b + 1)) : a2 >= 0 ? JSON.parse(rest.slice(a2)) : []); } catch { lines = []; }
      return { t: 'draw', by: 'them', ans: arg.replace(/^答案\s*[:：]?\s*/, '').slice(0, 20), lines };
    }
    if (/^(海龟汤|出题)$/.test(tag) && rest) return { t: 'soup', by: 'them', face: rest, bottom: arg.replace(/^汤底\s*[:：]?\s*/, ''), revealed: false };
    if (/^(揭晓|揭晓答案|公布答案|公布汤底)$/.test(tag)) return { act: 'reveal' };
    if (/^(问|提问|问出题人)$/.test(tag) && (rest || arg)) return { t: 'ask', text: rest || arg };
  }
  if (MAIL_END.test(s)) return null;
  return { t: 'text', text: s };
}

const MAIL_END = /^[\[【]\s*\/\s*(邮件|信)\s*[\]】]$/;
/** 整段回复 → { parts, acts }。邮件可以跨好几行：[邮件 主题] 到 [/邮件] 之间都是正文，不变成气泡 */
export function parseChat(text) {
  const parts = [], acts = [];
  const lines = stripThink(text).split('\n');
  let mail = null;
  lines.forEach((line, i) => {
    if (mail) {
      if (MAIL_END.test(line.trim())) { acts.push(mail); mail = null; }
      else mail.body += (mail.body ? '\n' : '') + line;
      return;
    }
    const p = parseLine(line);
    if (!p) return;
    // 后面有 [/邮件]，或者这行只有标题（正文还在后面），就进入多行模式
    if (p.act === 'mail' && (!p.body || lines.slice(i + 1).some((l) => MAIL_END.test(l.trim())))) { mail = p; return; }
    // [撤回]：这次回复里刚发的那条（或者带着那几个字的那条）变成「撤回了」；这次回复里找不到，就留给 chat.js 去以前的消息里找
    if (p.act === 'recall') { const k = findRecall(parts, p.q); if (k >= 0) parts[k] = makeRecall(parts[k], 'them'); else acts.push(p); return; }
    if (p.act) acts.push(p); else parts.push(p);
  });
  if (mail) acts.push(mail);
  for (const a of acts) if (a.act === 'mail') a.body = a.body.trim();
  return { parts, acts: acts.filter((a) => a.act !== 'mail' || a.body) };
}

/** 撤回：原来的部件收在 was 里（界面上不显示、你撤回的也不给模型看） */
export const makeRecall = (part, by) => ({ t: 'recall', by, was: part });
/** 要撤回的是哪条：q 空 = 最后一条还没撤回的；有 q = 从后往前找带这几个字的。找不到返回 -1 */
export function findRecall(parts, q = '') {
  const key = String(q || '').replace(/…$/, '').slice(0, 12);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].t === 'recall') continue;
    if (!key || partSearchText(parts[i]).includes(key)) return i;
  }
  return -1;
}

const yuan = (n) => (Math.round(n * 100) / 100).toFixed(2);
const PAY_STATE = { wait: '还没收', open: '还没收', taken: '已收下', back: '已退还' };

// ── 画：坐标都是 0～100（左上角 0,0），一笔是一串点 [x1, y1, x2, y2, …] ──
/** 模型写的线条（各种写法都认）→ [[x,y,x,y…]…] */
export function normLines(raw) {
  const ls = raw?.lines || raw?.strokes || raw;
  if (!Array.isArray(ls)) return [];
  const out = [];
  for (const s of ls.slice(0, 40)) {
    let pts = Array.isArray(s) ? s : s?.points || [];
    if (Array.isArray(pts[0])) pts = pts.flat();
    pts = pts.map(Number).filter(Number.isFinite).map((v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10)));
    if (pts.length % 2) pts.pop();
    if (pts.length >= 4) out.push(pts.slice(0, 400));
  }
  return out;
}
/** 画 → 字符网格（# 是笔画）：没有看图能力的模型靠这个看 */
export function drawGrid(lines, N = 28) {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  const put = (x, y) => { const c = Math.min(N - 1, Math.floor((x / 100) * N)), r = Math.min(N - 1, Math.floor((y / 100) * N)); g[r][c] = '#'; };
  for (const s of lines || []) {
    for (let i = 0; i + 3 < s.length; i += 2) {
      const [x0, y0, x1, y1] = [s[i], s[i + 1], s[i + 2], s[i + 3]];
      const n = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) / 100) * N * 2));
      for (let k = 0; k <= n; k++) put(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
    if (s.length === 2) put(s[0], s[1]);
  }
  return g.map((r) => r.join('')).join('\n');
}
const GAME_TEXT = { draw: '[一起玩 你画我猜] 你来画，我来猜', 'soup-host': '[一起玩 海龟汤] 你出题，我来猜' };

/** 部件 → 写给模型看的一行。full === true：你画的画带上字符网格（只有最近那幅带，旧的省掉；别处 .map(partText) 传进来的下标不算） */
export function partText(p, full = false) {
  const q = p.quote ? `[引用 ${p.quote.text}] ` : '';
  switch (p.t) {
    case 'text': return q + p.text;
    case 'voice': return q + `[语音] ${p.text}`;
    case 'sticker': return `[表情包 ${p.name}]`;
    case 'photo': return `[图片] ${p.desc}`;
    case 'red':
    case 'pay': return `[转账 ${yuan(p.amount)}] ${p.note || ''}（${PAY_STATE[p.state] || ''}）`.replace('  ', ' ');
    case 'event': return `[日程 ${p.yearly ? '每年 ' + p.date.slice(5) : p.date}] ${p.title}`;
    case 'note': return `（${p.text}）`;
    case 'fwd': return fwdText(p);
    case 'book': return `[书] 《${p.title}》`;
    // 他自己撤回的：他记得发过什么、也记得撤回了（写成他自己会写的样子）；你撤回的：他没看到内容
    case 'recall': return p.by === 'them' ? `${p.was ? partText(p.was) + '\n' : ''}[撤回]` : '（撤回了一条消息）';
    // 一起玩
    case 'draw': return p.by === 'them' ? `[画 ${p.ans || ''}]（你画的）` : full === true ? `[画]\n${drawGrid(p.lines)}` : '[画]（一幅画，之前猜过了）';
    case 'game': return GAME_TEXT[p.kind] || '[一起玩]';
    case 'soup': return p.by === 'host' ? `[海龟汤] ${p.face}（出题人出的题${p.revealed ? `，已经揭晓，汤底：${p.bottom}` : ''}）` : `[海龟汤 汤底：${p.bottom}] ${p.face}${p.revealed ? '\n[揭晓]' : ''}`;
    case 'ask': return `[问] ${p.text}`;
    default: return '';
  }
}
/** 转发的聊天记录写成文字（给模型看、写进动态） */
export const fwdText = (f) => [`[聊天记录] ${f.title}`, ...(f.items || []).map((x) => `${x.name}：${x.text}`)].join('\n');

/** 列表预览、通知、引用用的一句话 */
export function partPreview(p) {
  switch (p.t) {
    case 'text': return p.text;
    case 'voice': return '[语音] ' + p.text;
    case 'sticker': return '[表情包] ' + p.name;
    case 'photo': return '[图片]';
    case 'red':
    case 'pay': return '[转账]' + (p.note ? ' ' + p.note : '');
    case 'event': return '[日程] ' + p.title;
    case 'note': return p.text;
    case 'fwd': return '[聊天记录] ' + p.title;
    case 'book': return `[书] 《${p.title}》`;
    case 'recall': return '撤回了一条消息';
    case 'draw': return '[画]';
    case 'game': return '[一起玩]';
    case 'soup': return '[海龟汤] ' + p.face;
    case 'ask': return p.text;
    default: return '';
  }
}
/** 搜索用：一个部件里所有的字 */
export function partSearchText(p) {
  return [p.text, p.desc, p.name, p.note, p.title, p.face, ...(p.items || []).map((x) => x.name + '：' + x.text)].filter(Boolean).join(' ');
}
/** 引用里显示的那句（照片带上画面） */
export function quoteText(p, max = QUOTE_MAX) {
  const s = p.t === 'photo' ? '[图片] ' + p.desc : partPreview(p);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** 从模型回复里抠出 JSON：去掉 ```json 包裹，取第一个 { 到最后一个 } */
export function parseJSON(text) {
  const s = stripThink(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const body = s.slice(a, b + 1);
  try { return JSON.parse(body); } catch {}
  // 常见毛病：结尾多逗号、中文引号
  try { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch { return null; }
}

export const fmtYuan = yuan;
