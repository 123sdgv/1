// 把数据拼成发给模型的 messages。提示词的文字都在 prompt.js，这里只管「拿哪些数据、拿多少」。
import * as D from './data.js';
import * as T from './prompt.js';
import { partText, fwdText } from './parse.js';
import { full, span, sep, ymd, hm, md } from './time.js';
import { weatherLine } from './weather.js';

const LIMIT = { memo: 40, recentDiaries: 3, diaryChars: 700, recall: 2, offlineChat: 12, mails: 4, mailChars: 160, mailThread: 6 };

const accOf = (c) => D.accounts().find((a) => a.id === c.acc) || D.curAccount();
export const meName = (acc) => acc.name || '我';
const whoName = (who, acc) => (who === 'me' ? meName(acc) : D.nameOf(D.charById(who)));

function knowsOf(c) {
  return (c.knows || []).map((id) => D.charById(id)).filter(Boolean).map((k) => ({ name: k.name || D.nameOf(k), persona: k.persona }));
}
/** 他知不知道你的邮箱：你给他写过信，或者在聊天里把地址发给过他 */
export const knowsMyMail = (c) => { const a = D.myAddr(accOf(c)); return !!a && c.knowMail === a; };
export function identityOf(c) {
  const acc = accOf(c);
  return T.identity({ c, me: meName(acc), acc, knows: knowsOf(c), hisMail: D.charAddr(c), myMail: knowsMyMail(c) ? D.myAddr(acc) : '' });
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

// 一封信写成一行：谁写给谁、什么时候、主题、正文开头
function mailLine(m, c, acc, chars = LIMIT.mailChars) {
  const mine = m.box === 'sent' || (m.box === 'trash' && m.was === 'sent');
  return `${sep(m.ts)} ${mine ? `${meName(acc)}写给你` : `你写给${meName(acc)}`}：《${m.subject || '无主题'}》${cut(m.body.replace(/\s+/g, ' '), chars)}`;
}
export function memoryOf(c, recentText = '', { mails = true } = {}) {
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
    mails: mails ? D.mailsWith(c.id).slice(-LIMIT.mails).map((m) => mailLine(m, c, acc)) : [],
  });
}

// 日历：今天的（打没打勾）+ 接下来 30 天的
function eventsSoon() {
  const t = D.today();
  return D.upcoming(30).map(({ e, at, done }) => {
    const when = at === t ? '今天' : md(new Date(at + 'T12:00:00').getTime());
    const by = e.by && D.charById(e.by) ? `，${D.charById(e.by).name || D.nameOf(D.charById(e.by))}记的` : '';
    return `${when}：${e.title}${e.note ? '（' + e.note + '）' : ''}${e.yearly ? '（每年）' : ''}${at === t ? (done ? '（已完成）' : '（还没完成）') : ''}${by}`;
  });
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
    canMail: knowsMyMail(c),
    stickers: D.stickers().map((x) => x.name),
    identityText: identityOf(c),
    memoryText: memoryOf(c, lastUserText(list)),
    presentText: presentOf(c, prevTs),
  });
  const msgs = [{ role: 'system', content: sys }, ...historyMsgs(list, acc, D.genOf(c).histLen)];
  if (extra) msgs.push({ role: 'user', content: extra });
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '（继续）' });
  return msgs;
}
export function awayExtra(c) {
  const acc = accOf(c);
  const last = D.msgs(c.id).slice(-1)[0];
  return T.awayAsk({ me: meName(acc), gapText: last ? span(Date.now() - last.ts) : '很久', timeText: full(Date.now()) });
}

/** 线下剧情用哪套模型参数：社交里的角色用他的，自己写的用这段故事的 */
export const storyGen = (st) => (st.char ? D.genOf(D.charById(st.char)) : D.genOf(st.card || {}));
/** 线下剧情 */
export function buildOffline(st, { uptoId = null } = {}) {
  let list = D.storyMsgs(st.id);
  if (uptoId) { const i = list.findIndex((r) => r.id === uptoId); if (i >= 0) list = list.slice(0, i); }
  let sys;
  if (st.char) {
    const c = D.charById(st.char), acc = accOf(c);
    const chat = D.msgs(c.id).slice(-LIMIT.offlineChat).map((r) => `${r.role === 'them' ? c.name : meName(acc)}：${D.partsOf(r).map(partText).join(' / ')}`).join('\n');
    sys = T.offlineSystem({
      c, me: meName(acc), scene: st.scene,
      identityText: identityOf(c),
      memoryText: memoryOf(c, list.filter((r) => r.role === 'me').slice(-3).map((r) => D.partsOf(r).map(partText).join(' ')).join('\n')),
      presentText: presentOf(c, 0),
      recentChat: chat,
    });
  } else {
    const card = st.card || {}, me = card.meName || '我';
    sys = T.offlineSystem({ c: { name: card.name || '他' }, me, scene: st.scene, standalone: true, identityText: T.cardIdentity({ card, me }) });
  }
  const msgs = [{ role: 'system', content: sys }];
  for (const r of list.slice(-storyGen(st).histLen)) {
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
  for (const m of D.mailsWith(c.id)) if (m.ts > since) rows.push([m.ts, `${hm(m.ts)} 【邮件】${mailLine(m, c, acc, 500)}`]);
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
  if (m.fwd) lines.push(fwdText(m.fwd));
  if (m.likes?.length) lines.push(`点赞：${m.likes.map((w) => whoName(w, acc)).join('、')}`);
  for (const cm of m.comments || []) lines.push(`${whoName(cm.who, acc)}${cm.to ? ' 回复 ' + whoName(cm.to, acc) : ''}：${cm.text}${(cm.photos || []).map((p) => ` [图片] ${p}`).join('')}`);
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
// ── 邮件 ──
function mailThread(c, exceptId = null) {
  const acc = accOf(c);
  return D.mailsWith(c.id).filter((m) => m.id !== exceptId).slice(-LIMIT.mailThread).map((m) => mailLine(m, c, acc, 600)).join('\n');
}
export function buildMailName(c) {
  return [{ role: 'user', content: T.mailNamePrompt({ c, identityText: identityOf(c) }) }];
}
export function buildMailReply(c, mail) {
  const acc = accOf(c);
  return [{ role: 'user', content: T.mailReplyPrompt({ c, me: meName(acc), identityText: identityOf(c), memoryText: memoryOf(c, mail.body, { mails: false }), presentText: presentOf(c, 0), thread: mailThread(c, mail.id), mail }) }];
}
export function buildMailWrite(c) {
  const acc = accOf(c);
  return [{ role: 'user', content: T.mailWritePrompt({ c, me: meName(acc), identityText: identityOf(c), memoryText: memoryOf(c, '', { mails: false }), presentText: presentOf(c, 0), thread: mailThread(c) }) }];
}
