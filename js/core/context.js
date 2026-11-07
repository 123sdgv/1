// 把数据拼成发给模型的 messages。提示词的文字都在 prompt.js，这里只管「拿哪些数据、拿多少」。
import * as D from './data.js';
import * as T from './prompt.js';
import { partText } from './parse.js';
import { full, span, sep, ymd, hm, md } from './time.js';
import { weatherLine } from './weather.js';

const LIMIT = { memo: 40, recentDiaries: 3, diaryChars: 700, recall: 2, offlineChat: 12 };

const accOf = (c) => D.accounts().find((a) => a.id === c.acc) || D.curAccount();
export const meName = (acc) => acc.name || '我';
const whoName = (who, acc) => (who === 'me' ? meName(acc) : D.nameOf(D.charById(who)));

function knowsOf(c) {
  return (c.knows || []).map((id) => D.charById(id)).filter(Boolean).map((k) => ({ name: k.name || D.nameOf(k), net: k.net, persona: k.persona }));
}
export function identityOf(c) {
  const acc = accOf(c);
  return T.identity({ c, me: meName(acc), acc, knows: knowsOf(c) });
}

// 关键词召回：最近几句话里出现了某篇旧日记的关键词，就把那篇带上
function recall(c, text, skipIds) {
  if (!text) return [];
  const hits = [];
  for (const d of D.diaries(c.id)) {
    if (skipIds.has(d.id) || !d.keys?.length) continue;
    const n = d.keys.filter((k) => k && k.length >= 2 && text.includes(k)).length;
    if (n) hits.push([n, d]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, LIMIT.recall).map(([, d]) => d);
}
const cut = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

export function memoryOf(c, recentText = '') {
  const acc = accOf(c);
  const all = D.diaries(c.id);
  const recent = all.slice(-LIMIT.recentDiaries);
  const skip = new Set(recent.map((d) => d.id));
  const rec = recall(c, recentText, skip);
  return T.memory({
    me: meName(acc),
    memo: D.memos(c.id).slice(-LIMIT.memo).map((m) => m.text),
    recent: recent.map((d) => ({ date: d.date, text: cut(d.text, LIMIT.diaryChars) })),
    recalled: rec.map((d) => ({ date: d.date, text: cut(d.text, LIMIT.diaryChars) })),
  });
}

function eventsSoon() {
  const today = ymd(), out = [];
  const lim = Date.now() + 7 * 86400000;
  for (const e of D.events()) {
    let date = e.date;
    if (e.yearly) {
      const y = new Date().getFullYear();
      date = `${y}${e.date.slice(4)}`;
      if (date < today) date = `${y + 1}${e.date.slice(4)}`;
    }
    const t = new Date(date + 'T12:00:00').getTime();
    if (date >= today && t <= lim) out.push([date, `${date === today ? '今天' : md(t)}：${e.title}${e.note ? '（' + e.note + '）' : ''}${e.yearly ? '（每年）' : ''}`]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);
}

export function presentOf(c, lastTs) {
  const acc = accOf(c);
  return T.present({
    me: meName(acc),
    timeText: full(Date.now()),
    gapText: lastTs ? span(Date.now() - lastTs) : '',
    weather: weatherLine(),
    events: eventsSoon(),
  });
}

/** 聊天记录 → messages（间隔超过一小时的，在那条前面标上时间） */
function historyMsgs(list, acc, limit) {
  const out = [];
  let prev = 0;
  for (const r of list.slice(-limit)) {
    const parts = D.partsOf(r);
    if (!parts.length) continue;
    let text = parts.map(partText).filter(Boolean).join('\n');
    if (r.ts - prev > 3600000) text = T.stamp(sep(r.ts)) + '\n' + text;
    prev = r.ts;
    if (r.role === 'them') out.push({ role: 'assistant', content: text });
    else out.push({ role: 'user', content: r.role === 'note' ? `（${text}）` : text });
  }
  // 连着的同一方合并成一条，有些接口不接受两条 user 连着
  const merged = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else merged.push({ ...m });
  }
  return merged;
}
const lastUserText = (list, n = 6) => list.filter((r) => r.role === 'me').slice(-n).map((r) => D.partsOf(r).map(partText).join(' ')).join('\n');

/** 手机聊天 */
export function buildChat(c, { extra = null, uptoId = null } = {}) {
  const acc = accOf(c);
  let list = D.msgs(c.id);
  if (uptoId) { const i = list.findIndex((r) => r.id === uptoId); if (i >= 0) list = list.slice(0, i); }
  const prevTs = list.filter((r) => r.role !== 'note').slice(-2)[0]?.ts;
  const sys = T.chatSystem({
    c, me: meName(acc),
    identityText: identityOf(c),
    memoryText: memoryOf(c, lastUserText(list)),
    presentText: presentOf(c, prevTs),
  });
  const msgs = [{ role: 'system', content: sys }, ...historyMsgs(list, acc, D.settings().histLen)];
  if (extra) msgs.push({ role: 'user', content: extra });
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '（继续）' });
  return msgs;
}
export function awayExtra(c) {
  const acc = accOf(c);
  const last = D.msgs(c.id).slice(-1)[0];
  return T.awayAsk({ me: meName(acc), gapText: last ? span(Date.now() - last.ts) : '很久', timeText: full(Date.now()) });
}

/** 线下剧情 */
export function buildOffline(st, { uptoId = null } = {}) {
  const c = D.charById(st.char), acc = accOf(c);
  let list = D.storyMsgs(st.id);
  if (uptoId) { const i = list.findIndex((r) => r.id === uptoId); if (i >= 0) list = list.slice(0, i); }
  const chat = D.msgs(c.id).slice(-LIMIT.offlineChat).map((r) => `${r.role === 'them' ? c.name : meName(acc)}：${D.partsOf(r).map(partText).join(' / ')}`).join('\n');
  const sys = T.offlineSystem({
    c, me: meName(acc), scene: st.scene,
    identityText: identityOf(c),
    memoryText: memoryOf(c, list.filter((r) => r.role === 'me').slice(-3).map((r) => D.partsOf(r).map(partText).join(' ')).join('\n')),
    presentText: presentOf(c, 0),
    recentChat: chat,
  });
  const msgs = [{ role: 'system', content: sys }];
  for (const r of list.slice(-30)) {
    const text = D.partsOf(r).map(partText).join('\n');
    if (!text) continue;
    const role = r.role === 'them' ? 'assistant' : 'user';
    const last = msgs[msgs.length - 1];
    if (last.role === role && role !== 'system') last.content += '\n' + text; else msgs.push({ role, content: text });
  }
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '（继续）' });
  return msgs;
}

/** 日记：从上一篇以来的聊天和见面 */
export function diaryLog(c, since) {
  const acc = accOf(c), me = meName(acc);
  const rows = [];
  for (const r of D.msgs(c.id)) if (r.ts > since) rows.push([r.ts, `${hm(r.ts)} ${r.role === 'them' ? c.name : r.role === 'note' ? '（系统）' : me}：${D.partsOf(r).map(partText).join(' / ')}`]);
  for (const st of D.stories().filter((s) => s.char === c.id)) {
    for (const r of D.storyMsgs(st.id)) if (r.ts > since) rows.push([r.ts, `${hm(r.ts)} 【见面·${st.title || '线下'}】${r.role === 'them' ? '' : me + '：'}${cut(D.partsOf(r).map(partText).join(' '), 600)}`]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  // 按天分段
  let day = '', out = [];
  for (const [ts, line] of rows) {
    const d = ymd(ts);
    if (d !== day) { day = d; out.push(`—— ${d} ——`); }
    out.push(line);
  }
  return { text: out.join('\n'), count: rows.length, first: rows[0]?.[0], last: rows[rows.length - 1]?.[0] };
}
export function buildDiary(c, log) {
  const acc = accOf(c);
  const memo = D.memos(c.id).map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  return [{ role: 'user', content: T.diaryPrompt({ c, me: meName(acc), identityText: identityOf(c), memoNumbered: memo, log: cut(log.text, 14000), from: ymd(log.first), to: ymd(log.last) }) }];
}

/** 动态的文字版：正文、配图、评论 */
export function threadText(m) {
  const acc = D.accounts().find((a) => a.id === m.acc) || D.curAccount();
  const lines = [`${whoName(m.who, acc)}（${sep(m.ts)}）：${m.text}`];
  for (const p of m.photos || []) lines.push(`[图片] ${p}`);
  if (m.likes?.length) lines.push(`点赞：${m.likes.map((w) => whoName(w, acc)).join('、')}`);
  for (const cm of m.comments || []) lines.push(`${whoName(cm.who, acc)}${cm.to ? ' 回复 ' + whoName(cm.to, acc) : ''}：${cm.text}`);
  return lines.join('\n');
}
export function buildPost(c) {
  const acc = accOf(c);
  return [{ role: 'user', content: T.postPrompt({ c, me: meName(acc), identityText: identityOf(c), memoryText: memoryOf(c), presentText: presentOf(c, 0) }) }];
}
export function buildReact(c, m) {
  return [{ role: 'user', content: T.reactPrompt({ c, identityText: identityOf(c), memoryText: memoryOf(c, m.text), presentText: presentOf(c, 0), thread: threadText(m) }) }];
}
export function buildReply(c, m, cm) {
  const acc = D.accounts().find((a) => a.id === m.acc) || D.curAccount();
  return [{ role: 'user', content: T.replyPrompt({ c, identityText: identityOf(c), memoryText: memoryOf(c, cm.text), presentText: presentOf(c, 0), thread: threadText(m), who: whoName(cm.who, acc), text: cm.text }) }];
}
export function buildProfile(c) {
  return [{ role: 'user', content: T.profilePrompt({ c, identityText: identityOf(c) }) }];
}
