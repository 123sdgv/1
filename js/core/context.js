// 把数据拼成发给模型的 messages。提示词的文字都在 prompt.js，这里只管「拿哪些数据、拿多少」。
import * as D from './data.js';
import * as T from './prompt.js';
import { partText, fwdText } from './parse.js';
import { gameOf } from './game.js';
import { full, span, sep, ymd, hm, md, rangeText, monthText } from './time.js';
import { weatherLine } from './weather.js';

const LIMIT = { memo: 120, memoOld: 30, diaryLog: 14000, months: 12, weeks: 6, tlChars: 420, recentDiaries: 3, diaryChars: 700, recall: 2, offlineChat: 12, mails: 4, mailChars: 160, mailThread: 6 };

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
/** 聊天时带哪些备忘录：一般全带。实在太多（超过 LIMIT.memo）时，你亲手写的、最早记的那些一定留着，其余带最新的 */
function memoFor(c) {
  const all = D.memos(c.id);
  if (all.length <= LIMIT.memo) return all;
  const keep = new Set();
  all.forEach((m, i) => { if (!m.auto || i < LIMIT.memoOld) keep.add(m.id); });
  for (let i = all.length - 1; i >= 0 && keep.size < LIMIT.memo; i--) keep.add(all[i].id);
  return all.filter((m) => keep.has(m.id));
}

// 一封信写成一行：谁写给谁、什么时候、主题、正文开头
function mailLine(m, c, acc, chars = LIMIT.mailChars) {
  const mine = m.box === 'sent' || (m.box === 'trash' && m.was === 'sent');
  return `${sep(m.ts)} ${mine ? `${meName(acc)}写给你` : `你写给${meName(acc)}`}：《${m.subject || '无主题'}》${cut(m.body.replace(/\s+/g, ' '), chars)}`;
}
const diaryOut = (d) => ({ date: d.date, text: cut(d.text, LIMIT.diaryChars) });
/** 关键词想起来的旧日记（跟最近 3 篇不重复） */
function recalledOf(c, recentText) {
  const skip = new Set(D.diaries(c.id).slice(-LIMIT.recentDiaries).map((d) => d.id));
  return recall(c, recentText, skip).map(diaryOut);
}
/** 时间线里带给他看的：月记（最近 12 个月）+ 还没并进月记的周记（最近 6 段），按时间从早到晚 */
export const tlTitle = (t) => (t.kind === 'month' ? `${monthText(t.from.slice(0, 7))}（月记）` : `${rangeText(t.from, t.to)}（周记）`);
function timelineFor(c) {
  const all = D.timeline(c.id);
  const months = all.filter((t) => t.kind === 'month').sort((a, b) => (a.from < b.from ? -1 : 1)).slice(-LIMIT.months);
  const done = new Set(months.map((t) => t.from.slice(0, 7)));
  const weeks = all.filter((t) => t.kind === 'week' && !done.has(t.from.slice(0, 7))).sort((a, b) => (a.from < b.from ? -1 : 1)).slice(-LIMIT.weeks);
  return [...months, ...weeks].map((t) => ({ title: tlTitle(t), text: cut(t.text, LIMIT.tlChars) }));
}
export function memoryOf(c, recentText = '', { mails = true, withRecall = true, timeline = true } = {}) {
  const acc = accOf(c);
  const all = D.diaries(c.id);
  const recent = all.slice(-LIMIT.recentDiaries);
  const skip = new Set(recent.map((d) => d.id));
  const rec = withRecall ? recall(c, recentText, skip) : [];
  return T.memory({
    me: meName(acc),
    memo: memoFor(c).map((m) => m.text),
    recent: recent.map((d) => ({ date: d.date, text: cut(d.text, LIMIT.diaryChars) })),
    recalled: rec.map((d) => ({ date: d.date, text: cut(d.text, LIMIT.diaryChars) })),
    mails: mails ? D.mailsWith(c.id).slice(-LIMIT.mails).map((m) => mailLine(m, c, acc)) : [],
    timeline: timeline ? timelineFor(c) : [],
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
// 聊天记录窗口：不是每来一条就往后挪一条（那样开头每次都变，接口缓存全废），
// 而是攒够一段再整段往后挪。带的条数在「上下文」设的数往下一点点之间
function windowOf(list, limit) {
  const step = Math.max(5, Math.round(limit / 5));
  const n = list.length;
  return n <= limit ? list : list.slice(Math.ceil((n - limit) / step) * step);
}
function historyMsgs(list, acc, limit) {
  const out = [];
  let prev = 0;
  // 你画的画：只有最近那幅给他看字符网格，前面的省掉
  const lastDraw = [...list].reverse().find((r) => r.role === 'me' && D.partsOf(r).some((p) => p.t === 'draw'))?.id;
  for (const r of windowOf(list, limit)) {
    const parts = D.partsOf(r);
    if (!parts.length) continue;
    let text = parts.map((p) => partText(p, r.id === lastDraw)).filter(Boolean).join('\n');
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
/** 会变的那段接在最后一条（一定是 user）前面 */
function withTail(msgs, tailText) {
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '（继续）' });
  if (tailText) { const last = msgs[msgs.length - 1]; last.content = tailText + '\n\n' + last.content; }
  return msgs;
}

/** 他最近 3 天在动态里做的事：自己发的（带别人的反应）、评论和回复。最多 8 条 */
function activityOf(c) {
  const acc = accOf(c), since = Date.now() - 3 * 86400000;
  const rows = [];
  for (const m of D.momentsOf(acc.id)) {
    if (m.who === c.id && m.ts > since) {
      const fb = [
        m.likes.filter((w) => w !== c.id).length ? `${m.likes.filter((w) => w !== c.id).map((w) => whoName(w, acc)).join('、')}点了赞` : '',
        ...m.comments.filter((x) => x.who !== c.id).slice(-3).map((x) => `${whoName(x.who, acc)}评论：${cut(x.text, 50)}`),
      ].filter(Boolean).join('；');
      rows.push([m.ts, `${sep(m.ts)} 你发了一条动态：${cut(m.text, 100)}${m.photos?.length ? `（配了 ${m.photos.length} 张图）` : ''}${fb ? `（${fb}）` : ''}`]);
    }
    for (const cm of m.comments || []) {
      if (cm.who !== c.id || cm.ts <= since) continue;
      const where = m.who === c.id ? '在自己的动态下面' : `在${whoName(m.who, acc)}的动态「${cut(m.text, 24)}」下面`;
      rows.push([cm.ts, `${sep(cm.ts)} 你${where}${cm.to ? '回复' + whoName(cm.to, acc) : '评论'}：${cut(cm.text, 80)}`]);
    }
  }
  return rows.sort((a, b) => a[0] - b[0]).slice(-8).map((r) => r[1]);
}

const lastUserText = (list, n = 6) => list.filter((r) => r.role === 'me').slice(-n).map((r) => D.partsOf(r).map(partText).join(' ')).join('\n');

/**
 * 手机聊天。最前面的系统提示只放不常变的（人设、记忆、规则），
 * 时间天气日历、想起来的旧事、他最近的动态、搜到的结果，接在最后一条消息前面。
 * skipId：不带这条（正在写的那条回复）；search：{ q, results, error, said } 他刚搜完
 */
export function buildChat(c, { extra = null, uptoId = null, skipId = null, canSearch = false, search = null } = {}) {
  const acc = accOf(c);
  let list = D.msgs(c.id);
  if (uptoId) { const i = list.findIndex((r) => r.id === uptoId); if (i >= 0) list = list.slice(0, i); }
  if (skipId) list = list.filter((r) => r.id !== skipId);
  const prevTs = list.filter((r) => r.role !== 'note').slice(-2)[0]?.ts;
  const me = meName(acc);
  const sys = T.chatSystem({
    c, me,
    canMail: knowsMyMail(c),
    canSearch: canSearch && !search,
    stickers: D.stickers().map((x) => x.name),
    canBook: D.booksReadBy(c.id).length > 0,
    identityText: identityOf(c),
    memoryText: memoryOf(c, '', { withRecall: false }),
  });
  const msgs = [{ role: 'system', content: sys }, ...historyMsgs(list, acc, D.genOf(c).histLen)];
  if (extra) msgs.push({ role: 'user', content: extra });
  return withTail(msgs, T.tail({ me, parts: [
    presentOf(c, prevTs),
    T.recalledText(recalledOf(c, lastUserText(list))),
    T.activity(activityOf(c)),
    T.reading(readingOf(c)),
    T.gameHint({ g: gameOf(list), me }),
    search ? T.searchResult({ me, ...search }) : '',
  ] }));
}

/** 线下剧情用哪套模型参数：社交里的角色用他的，自己写的用这段故事的 */
export const storyGen = (st) => (st.char ? D.genOf(D.charById(st.char)) : D.genOf(st.card || {}));
/** 线下剧情 */
export function buildOffline(st, { uptoId = null } = {}) {
  let list = D.storyMsgs(st.id);
  if (uptoId) { const i = list.findIndex((r) => r.id === uptoId); if (i >= 0) list = list.slice(0, i); }
  let sys, me, tailParts = [];
  if (st.char) {
    const c = D.charById(st.char), acc = accOf(c);
    me = meName(acc);
    const chat = D.msgs(c.id).slice(-LIMIT.offlineChat).map((r) => `${r.role === 'them' ? c.name : me}：${D.partsOf(r).map(partText).join(' / ')}`).join('\n');
    sys = T.offlineSystem({
      c, me, scene: st.scene,
      identityText: identityOf(c),
      memoryText: memoryOf(c, '', { withRecall: false }),
      recentChat: chat,
    });
    const said = list.filter((r) => r.role === 'me').slice(-3).map((r) => D.partsOf(r).map(partText).join(' ')).join('\n');
    tailParts = [presentOf(c, 0), T.recalledText(recalledOf(c, said)), T.activity(activityOf(c))];
  } else {
    const card = st.card || {};
    me = card.meName || '我';
    sys = T.offlineSystem({ c: { name: card.name || '他' }, me, scene: st.scene, standalone: true, identityText: T.cardIdentity({ card, me }) });
  }
  const msgs = [{ role: 'system', content: sys }];
  for (const r of windowOf(list, storyGen(st).histLen)) {
    const text = D.partsOf(r).map(partText).join('\n');
    if (!text) continue;
    const role = r.role === 'them' ? 'assistant' : 'user';
    const last = msgs[msgs.length - 1];
    if (last.role === role && role !== 'system') last.content += '\n' + text; else msgs.push({ role, content: text });
  }
  return withTail(msgs, T.tail({ me, parts: tailParts }));
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
  // 一起读书时你们写的段评
  for (const b of D.booksReadBy(c.id)) {
    const chs = D.chapters(b.id), all = D.bookCmts(b.id);
    for (const x of all) {
      if (x.ts <= since || (x.who !== 'me' && x.who !== c.id)) continue;
      const to = x.to && all.find((y) => y.id === x.to);
      const n = chs.findIndex((ch) => ch.id === x.ch) + 1;
      rows.push([x.ts, `${hm(x.ts)} 【读书·《${b.title}》第 ${n} 章段评】${x.who === 'me' ? me : c.name}${to ? ' 回复 ' + (to.who === 'me' ? me : to.who === c.id ? c.name : D.nameOf(D.charById(to.who))) : ''}：${cut(x.text, 200)}`]);
    }
  }
  rows.sort((a, b) => a[0] - b[0]);
  // 太长了一篇日记装不下：只写到装得下的地方（last = 实际写到的那条），剩下的留给下一篇，不会漏掉最近的事
  let take = rows.length, size = 0;
  for (let i = 0; i < rows.length; i++) {
    size += rows[i][1].length + 1;
    if (size > LIMIT.diaryLog && i > 0) { take = i; break; }
  }
  while (take < rows.length && rows[take][0] === rows[take - 1][0]) take++; // 同一刻的别拆开
  const used = rows.slice(0, take);
  // 按天分段
  let day = '', out = [];
  for (const [ts, line] of used) {
    const d = ymd(ts);
    if (d !== day) { day = d; out.push(`—— ${d} ——`); }
    out.push(line);
  }
  return { text: out.join('\n'), count: rows.length, more: take < rows.length, first: used[0]?.[0], last: used[used.length - 1]?.[0] };
}
export function buildDiary(c, log) {
  const acc = accOf(c);
  const memo = D.memos(c.id).map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  return [{ role: 'user', content: T.diaryPrompt({ c, me: meName(acc), identityText: identityOf(c), memoNumbered: memo, log: log.text, from: ymd(log.first), to: ymd(log.last) }) }];
}

// ── 时间线 ──
export function buildWeek(c, from, to, diaries) {
  const text = diaries.map((d) => `${d.date}${d.book ? `（读完《${d.bookTitle || ''}》写的）` : ''}\n${cut(d.text, 1200)}${d.inner ? `\n（心里话）${cut(d.inner, 300)}` : ''}`).join('\n\n');
  return [{ role: 'user', content: T.weekPrompt({ c, me: meName(accOf(c)), identityText: identityOf(c), range: rangeText(from, to), diaries: text }) }];
}
export function buildMonth(c, ym, weeks) {
  const text = weeks.map((w) => `${rangeText(w.from, w.to)}\n${w.text}`).join('\n\n');
  return [{ role: 'user', content: T.monthPrompt({ c, me: meName(accOf(c)), identityText: identityOf(c), month: monthText(ym), weeks: text }) }];
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
  // 带上他最近发过的，别老发重复的
  return [{ role: 'user', content: T.postPrompt({ c, me: meName(acc), identityText: identityOf(c), memoryText: memoryOf(c), presentText: [presentOf(c, 0), T.activity(activityOf(c))].filter(Boolean).join('\n\n') }) }];
}
export function buildReact(c, m) {
  return [{ role: 'user', content: T.reactPrompt({ c, identityText: identityOf(c), memoryText: memoryOf(c, m.text, { timeline: false }), presentText: presentOf(c, 0), thread: threadText(m) }) }];
}
export function buildReply(c, m, cm) {
  const acc = D.accounts().find((a) => a.id === m.acc) || D.curAccount();
  return [{ role: 'user', content: T.replyPrompt({ c, identityText: identityOf(c), memoryText: memoryOf(c, cm.text, { timeline: false }), presentText: presentOf(c, 0), thread: threadText(m), who: whoName(cm.who, acc), text: cm.text }) }];
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

// ── 阅读（一起读书）──
// 他一次只读一章；太长的章按字数分成几部分，一次读一部分。前面读过的不再给原文，只给他自己写的读书笔记。
const READ = { chunk: 7000, notes: 6000, reviewNotes: 9000, others: 40, para: 600, talk: 50, otherTalk: 30 };
const accOfBook = (b) => D.accounts().find((a) => a.id === b.acc) || D.curAccount();
/** 段评是谁写的，从 c 的角度看：你自己 / 你 / 认识的人 / 不认识的人 */
function readerLabel(who, c, acc) {
  if (who === 'me') return meName(acc);
  if (who === c.id) return '你自己';
  const o = D.charById(who);
  if (!o) return '一个读者';
  const n = o.name || D.nameOf(o);
  return (c.knows || []).includes(who) ? `${n}（你认识）` : `${n}（你不认识这个人）`;
}
/** 一章分成几部分：[[段的下标…], …]，每部分不超过 READ.chunk 字 */
export function chunksOf(ch) {
  const out = [];
  let cur = [], n = 0;
  (ch?.paras || []).forEach((p, i) => {
    if (cur.length && n + p.text.length > READ.chunk) { out.push(cur); cur = []; n = 0; }
    cur.push(i); n += p.text.length;
  });
  if (cur.length) out.push(cur);
  return out.length ? out : [[]];
}
const chTitle = (ch, i) => `第 ${i + 1} 章${ch.title ? ' ' + ch.title : ''}`;
/** 读书笔记：按章的顺序，太长了从前面开始裁 */
function notesText(rd, chs, upto, max) {
  const rows = [];
  chs.forEach((ch, i) => { if (i < upto && rd.notes?.[ch.id]) rows.push(`${chTitle(ch, i)}：${rd.notes[ch.id]}`); });
  let out = rows.join('\n'), cutHead = false;
  while (out.length > max && rows.length > 1) { rows.shift(); out = rows.join('\n'); cutHead = true; }
  return (cutHead ? '（更早的笔记记不太清了）\n' : '') + cut(out, max);
}

/** 读一章（第 k 部分）。返回 { msgs, nums }：nums[编号] = 段评 id，他回复时按编号找 */
export function buildReadChapter(c, b, chIdx, k) {
  const acc = accOfBook(b), me = meName(acc);
  const chs = D.chapters(b.id), ch = chs[chIdx];
  const rd = D.readers(b.id)[c.id] || {};
  const parts = chunksOf(ch);
  const idx = parts[k] || [];
  const text = idx.map((i) => `[${i + 1}] ${ch.paras[i].text}`).join('\n');
  let notes = notesText(rd, chs, chIdx, READ.notes);
  if (k > 0 && rd.notes?.[ch.id]) notes += `\n${chTitle(ch, chIdx)}（前面的部分）：${rd.notes[ch.id]}`;
  // 这一章已经有的段评（最近 40 条），编上号
  const pIdx = new Map(ch.paras.map((p, i) => [p.id, i]));
  const all = D.bookCmts(b.id).filter((x) => x.ch === ch.id && pIdx.has(x.p)).sort((a, z) => a.ts - z.ts).slice(-READ.others);
  const nums = {}, numOf = {};
  const others = all.map((x, i) => {
    nums[i + 1] = x.id; numOf[x.id] = i + 1;
    const to = x.to ? (numOf[x.to] ? ` 回复 #${numOf[x.to]}` : ' 回复别人') : '';
    return `#${i + 1}${to}（第 ${pIdx.get(x.p) + 1} 段）${readerLabel(x.who, c, acc)}：${x.text}`;
  }).join('\n');
  return {
    nums,
    msgs: [{ role: 'user', content: T.readChapterPrompt({
      c, me, title: b.title, chNo: chIdx + 1, chTitle: ch.title, part: k + 1, parts: parts.length,
      identityText: identityOf(c), memoryText: memoryOf(c, '', { mails: false, withRecall: false, timeline: false }),
      notes: notes.trim(), text, others,
    }) }],
  };
}

/** 一段下面的段评（楼里的都算上） */
function paraThread(b, cm, c, acc) {
  const all = D.bookCmts(b.id).filter((x) => x.ch === cm.ch && x.p === cm.p).sort((a, z) => a.ts - z.ts);
  const byId = new Map(all.map((x) => [x.id, x]));
  return all.map((x) => `${readerLabel(x.who, c, acc)}${x.to && byId.get(x.to) ? ' 回复 ' + readerLabel(byId.get(x.to).who, c, acc) : ''}：${x.text}`).join('\n');
}
/** 有人回了他 / 你在他读过的段落写了段评 */
export function buildReadReply(c, b, cm, kind) {
  const acc = accOfBook(b), me = meName(acc);
  const chs = D.chapters(b.id), chIdx = chs.findIndex((x) => x.id === cm.ch);
  const para = chs[chIdx]?.paras.find((p) => p.id === cm.p)?.text || '';
  return [{ role: 'user', content: T.readReplyPrompt({
    c, me, title: b.title, chNo: chIdx + 1, para: cut(para, READ.para), thread: paraThread(b, cm, c, acc),
    who: cm.who === 'me' ? me : readerLabel(cm.who, c, acc).replace(/（.*）$/, ''), text: cm.text, kind,
    identityText: identityOf(c), memoryText: memoryOf(c, cm.text, { mails: false, timeline: false }),
  }) }];
}

/** 整本读完：阅读日记 */
export function buildReadReview(c, b) {
  const acc = accOfBook(b), me = meName(acc);
  const chs = D.chapters(b.id), rd = D.readers(b.id)[c.id] || {};
  const all = D.bookCmts(b.id).sort((a, z) => a.ts - z.ts);
  const byId = new Map(all.map((x) => [x.id, x]));
  const chNo = (x) => chs.findIndex((ch) => ch.id === x.ch) + 1;
  const line = (x) => {
    const to = x.to && byId.get(x.to);
    return `第 ${chNo(x)} 章 ${readerLabel(x.who, c, acc)}${to ? ' 回复 ' + readerLabel(to.who, c, acc) : ''}：${cut(x.text, 160)}`;
  };
  // 你和他之间的：你写的、他写的（他回别人的不算）
  const talk = all.filter((x) => x.who === 'me' || (x.who === c.id && (!x.to || byId.get(x.to)?.who === 'me' || !byId.get(x.to)))).slice(-READ.talk).map(line).join('\n');
  // 别的读者：别的角色写的，和他跟他们的来往
  const others = all.filter((x) => (x.who !== 'me' && x.who !== c.id) || (x.who === c.id && x.to && byId.get(x.to) && byId.get(x.to).who !== 'me')).slice(-READ.otherTalk).map(line).join('\n');
  return [{ role: 'user', content: T.readReviewPrompt({
    c, me, title: b.title, chTotal: chs.length, today: ymd(Date.now()),
    identityText: identityOf(c), memoryText: memoryOf(c, b.title, { mails: false }),
    notes: notesText(rd, chs, chs.length, READ.reviewNotes) || '（没有记笔记）', talk, others,
  }) }];
}

/** 聊天时告诉他：在和你一起读哪本书、读到哪、最近的笔记、你最近写的段评（最多两本，最近读的在前） */
function readingOf(c) {
  const acc = accOf(c), me = meName(acc);
  return D.booksReadBy(c.id).filter((b) => b.acc === c.acc).sort((a, z) => (z.lastTs || 0) - (a.lastTs || 0)).slice(0, 2).map((b) => {
    const chs = D.chapters(b.id), rd = D.readers(b.id)[c.id];
    const read = chs.filter((ch) => rd.read?.includes(ch.id));
    const last = [...chs].reverse().find((ch) => rd.notes?.[ch.id]);
    const mine = D.bookCmts(b.id).filter((x) => x.who === 'me').slice(-2).map((x) => `「${cut(x.text, 60)}」`).join('');
    const where = rd.review ? `你们一起读完了，你写过阅读日记` : read.length ? `你读完了 ${read.length} 章（现在一共 ${chs.length} 章${b.done ? '，已完结' : '，还在更新'}），${me}翻到了第 ${Math.max(1, b.reach || 0)} 章` : `${me}刚邀请你一起读，你还没开始读（现在一共 ${chs.length} 章）`;
    return [`《${b.title}》：${where}。`, last && !rd.review ? `你最近的读书笔记：${cut(rd.notes[last.id], 200)}` : '', mine ? `${me}最近写的段评：${mine}` : ''].filter(Boolean).join(' ');
  });
}
