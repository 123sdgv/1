// 一起读书。
// - 书一章一章上传（一段文字一章），这里把文字切成段落，改章节时尽量让段评还挂在原来那段上。
// - 你在聊天里把书发给他，他就加入一起读：跟着你读（你翻到第几章，他最多读到第几章），一次读一章，太长的章分几次读。
//   每次读完写段评、回别人的段评（认不认识那个人，看角色资料里的「他认识谁」）、给自己记读书笔记（以后接着读、聊天时用）。
// - 书标了「完结」、每章都读完了：写一篇阅读日记，进他的日记。
// - 你回他的段评、或者在他读过的段落写段评：过一会儿他可能回你。
// 网页关着什么都不跑：打开时、开着的时候每隔一会儿补算（life.js 的 tick 调 readTick），你翻到新的一章也会马上叫一次（kick）。
import * as D from './data.js';
import { chat, queue } from './api.js';
import * as C from './context.js';
import { parseJSON } from './parse.js';
import { ymd } from './time.js';

const MIN = 60000;
const rand = (a, b) => a + Math.random() * (b - a);
const ask = (c, msgs, max) => chat(msgs, { stream: false, max_tokens: max, temperature: D.genOf(c).temperature });

// 他正在读的（书里显示他在读哪一章）：{ book, who, ch }
let now = null;
export const readingNow = () => now;
const setNow = (x, bid) => { now = x; D.emit('bookrd', bid); };

// ── 章节 ──
// 比较两段字是不是同一段时，不看空格和标点
export const norm = (s) => String(s || '').replace(/[\s　「」『』“”"'‘’…—\-，。、,.!！?？；;：:（）()《》<>]/g, '');

/** 文字 → 段落：一行一段，去掉开头的空格（排版自己缩进），空行不要；很长又没换行的按句子切开 */
export function splitParas(text) {
  const out = [];
  for (let line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    line = line.replace(/^[\s　]+|[\s　]+$/g, '');
    if (!line) continue;
    if (line.length <= 600) { out.push(line); continue; }
    const pieces = [];
    let buf = '';
    for (const s of line.match(/[^。！？!?]+[。！？!?]+[」』”’）)]*|[^。！？!?]+$/g) || [line]) {
      buf += s;
      if (buf.length >= 260) { pieces.push(buf); buf = ''; }
    }
    if (buf) { if (pieces.length && buf.length < 40) pieces[pieces.length - 1] += buf; else pieces.push(buf); }
    out.push(...pieces);
  }
  return out;
}

/** 存一章（新加或改）。改的时候：字一样的段落留原来的 id；改了字的，同一个位置的旧段落没被占就接着用；
 *  剩下挂不上的段评按他引的那几个字找新段落，找不到就删掉（回它的也一起删） */
export function saveChapter(bid, { id = null, title = '', text = '' }) {
  const list = D.chapters(bid);
  const texts = splitParas(text);
  const old = id ? list.find((x) => x.id === id) : null;
  let paras;
  if (!old) paras = texts.map((t) => ({ id: D.uid(), text: t }));
  else {
    const pool = new Map();
    for (const p of old.paras) { if (!pool.has(p.text)) pool.set(p.text, []); pool.get(p.text).push(p.id); }
    const used = new Set();
    paras = texts.map((t) => {
      const pid = (pool.get(t) || []).find((x) => !used.has(x));
      if (pid) used.add(pid);
      return { id: pid || null, text: t };
    });
    // 改了字的：在前后没改的两段之间，找一段还没被占的旧段落接着用（改个错字、前面插一段，段评都还在）
    const oldIdx = new Map(old.paras.map((p, i) => [p.id, i]));
    paras.forEach((p, i) => {
      if (p.id) return;
      let lo = -1, hi = old.paras.length;
      for (let j = i - 1; j >= 0; j--) if (paras[j].id && oldIdx.has(paras[j].id)) { lo = oldIdx.get(paras[j].id); break; }
      for (let j = i + 1; j < paras.length; j++) if (paras[j].id && oldIdx.has(paras[j].id) && used.has(paras[j].id)) { hi = oldIdx.get(paras[j].id); break; }
      const o = old.paras.slice(lo + 1, hi).find((x) => !used.has(x.id));
      if (o) { used.add(o.id); p.id = o.id; } else p.id = D.uid();
    });
    const ids = new Set(paras.map((p) => p.id));
    const cms = D.bookCmts(bid);
    if (cms.some((x) => x.ch === old.id && !ids.has(x.p))) {
      const moved = new Map(); // 段评 id → 新的段 id（null = 删掉）
      for (const x of cms) {
        if (x.ch !== old.id || ids.has(x.p) || x.to) continue;
        const q = norm(x.q);
        const hit = q.length >= 4 ? paras.find((p) => norm(p.text).includes(q)) : null;
        moved.set(x.id, hit ? hit.id : null);
      }
      const rootOf = (x) => { let r = x, n = 0; while (r?.to && n++ < 50) r = cms.find((y) => y.id === r.to); return r; };
      const fixed = [];
      for (const x of cms) {
        if (x.ch !== old.id || ids.has(x.p)) { fixed.push(x); continue; }
        const root = x.to ? rootOf(x) : x;
        const to = root && moved.get(root.id);
        if (to) fixed.push({ ...x, p: to });
      }
      D.setBookCmts(bid, fixed);
    }
  }
  const ch = { id: old?.id || D.uid(), title: String(title || '').trim(), paras, ts: old?.ts || Date.now() };
  if (old) list[list.indexOf(old)] = ch; else list.push(ch);
  D.setChapters(bid, list);
  const b = D.bookById(bid);
  if (b) D.saveBook({ ...b, lastTs: Date.now() });
  kick();
  return ch;
}

/** 删一章：段评、他们读过这章的记录、读书笔记都去掉 */
export function removeChapter(bid, chId) {
  const list = D.chapters(bid).filter((x) => x.id !== chId);
  D.setChapters(bid, list);
  const gone = new Set(D.bookCmts(bid).filter((x) => x.ch === chId).map((x) => x.id));
  D.setBookCmts(bid, D.bookCmts(bid).filter((x) => x.ch !== chId));
  D.setBookJobs(D.bookJobs().filter((j) => !(j.book === bid && gone.has(j.cm))));
  const rd = D.readers(bid);
  for (const r of Object.values(rd)) {
    r.read = (r.read || []).filter((x) => x !== chId);
    if (r.notes) delete r.notes[chId];
    if (r.part?.ch === chId) r.part = null;
  }
  D.setReaders(bid, rd);
  const b = D.bookById(bid);
  if (b) D.saveBook({ ...b, reach: Math.min(b.reach || 0, list.length), pos: b.pos?.ch === chId ? null : b.pos });
}

// ── 一起读 ──
/** 他加入一起读（在聊天里把书发给他时） */
export function join(bid, cid) {
  const rd = D.readers(bid);
  if (!rd[cid]) { rd[cid] = { joined: Date.now(), read: [], notes: {}, part: null }; D.setReaders(bid, rd); }
  kick(3000);
}
/** 不一起读了（他的段评、读书笔记留着） */
export function leave(bid, cid) {
  const rd = D.readers(bid);
  delete rd[cid];
  D.setReaders(bid, rd);
  D.setBookJobs(D.bookJobs().filter((j) => !(j.book === bid && j.who === cid)));
}
/** 他最多读到第几章（从 1 数）：你翻到哪他读到哪；刚邀请、你还没翻开的时候，先读第 1 章 */
export const limitOf = (b) => Math.min(D.chapters(b.id).length, Math.max(1, b.reach || 0));
/** 他接下来要读的：{ idx, k }（第几章、这章的第几部分），没有了返回 null */
export function nextOf(b, rd) {
  const chs = D.chapters(b.id), lim = limitOf(b);
  for (let i = 0; i < lim; i++) {
    const ch = chs[i];
    if (!(rd.read || []).includes(ch.id)) return { idx: i, k: rd.part?.ch === ch.id ? rd.part.k : 0 };
  }
  return null;
}
/** 每一章都读完了 */
export const finished = (b, rd) => { const chs = D.chapters(b.id); return chs.length > 0 && chs.every((ch) => (rd.read || []).includes(ch.id)); };

// ── 你写段评 ──
/** 你写一条（to = 回复哪条）。回的是他：过一会儿他可能回你；直接写在某段下面：读过这章的人可能会来看看（最多两个） */
export function addMyComment(bid, { ch, p, to = null, text }) {
  const all = D.bookCmts(bid);
  const cm = { id: D.uid(), ch, p, who: 'me', to, text, ts: Date.now() };
  D.setBookCmts(bid, [...all, cm]);
  const target = to && all.find((x) => x.id === to);
  const jobs = [];
  if (target) {
    if (target.who !== 'me' && D.charById(target.who)) jobs.push({ book: bid, who: target.who, cm: cm.id, kind: 'reply', due: Date.now() + rand(0.5, 3) * MIN });
  } else {
    const rd = D.readers(bid);
    const seen = Object.keys(rd).filter((cid) => D.charById(cid) && (rd[cid].read || []).includes(ch)).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const cid of seen) if (Math.random() < 0.75) jobs.push({ book: bid, who: cid, cm: cm.id, kind: 'see', due: Date.now() + rand(1, 6) * MIN });
  }
  if (jobs.length) D.setBookJobs([...D.bookJobs(), ...jobs]);
  return cm;
}

// ── 他读 ──
/** 他评的是哪一段：先看他说的段号里有没有他抄的那几个字；没有就在这次读的段落里找那几个字（抄得不完全一样就找能对上的最长一截）；再不行就信段号 */
function anchor(ch, pi, quote, allowed) {
  const q = norm(quote);
  const has = (i) => norm(ch.paras[i].text).includes(q);
  if (allowed.includes(pi) && (q.length < 2 || has(pi))) return pi;
  if (q.length >= 2) {
    const exact = allowed.find(has);
    if (exact != null) return exact;
    let best = -1, score = 3;
    for (const i of allowed) {
      const t = norm(ch.paras[i].text);
      for (let len = Math.min(q.length, 16); len > score; len--) {
        let ok = false;
        for (let a = 0; a + len <= q.length && !ok; a++) ok = t.includes(q.slice(a, a + len));
        if (ok) { score = len; best = i; break; }
      }
    }
    if (best >= 0) return best;
  }
  return allowed.includes(pi) ? pi : -1;
}
const arr = (x) => (Array.isArray(x) ? x : []);

async function readJob(b, cid) {
  const c = D.charById(cid);
  const nx = nextOf(b, D.readers(b.id)[cid]);
  if (!c || !nx) return;
  const ch = D.chapters(b.id)[nx.idx];
  const parts = C.chunksOf(ch);
  const k = Math.min(nx.k, parts.length - 1);
  setNow({ book: b.id, who: cid, ch: ch.id }, b.id);
  try {
    const { msgs, nums } = C.buildReadChapter(c, b, nx.idx, k);
    const j = parseJSON(await ask(c, msgs, 2000));
    if (!j || (typeof j.note !== 'string' && !Array.isArray(j.comments))) throw new Error('这次没读成');
    // 读的时候书、这章、他可能被删了
    const fresh = D.chapters(b.id).find((x) => x.id === ch.id);
    const rdAll = D.readers(b.id), rd = rdAll[cid];
    if (!fresh || !rd || !D.bookById(b.id)) return;
    const allowed = parts[k].filter((i) => i < fresh.paras.length);
    const all = D.bookCmts(b.id);
    const t0 = Date.now(), added = [], replies = [];
    for (const x of arr(j.comments).slice(0, 6)) {
      const text = String(x?.text || '').trim();
      if (!text) continue;
      const pi = anchor(fresh, Number(x.p) - 1, String(x.quote || ''), allowed);
      if (pi < 0) continue;
      added.push({ id: D.uid(), ch: ch.id, p: fresh.paras[pi].id, who: cid, to: null, q: String(x.quote || '').slice(0, 40), text, ts: t0 + added.length, fresh: true });
    }
    for (const x of arr(j.replies).slice(0, 4)) {
      const text = String(x?.text || '').trim();
      const t = all.find((y) => y.id === nums[Number(String(x?.to ?? '').replace(/\D/g, ''))]);
      if (!text || !t || t.who === cid) continue;
      replies.push({ id: D.uid(), ch: t.ch, p: t.p, who: cid, to: t.id, text, ts: t0 + 10 + replies.length, fresh: true });
    }
    D.setBookCmts(b.id, [...all, ...added, ...replies]);
    const note = String(j.note || '').trim();
    rd.notes ||= {};
    if (note) rd.notes[ch.id] = k > 0 && rd.notes[ch.id] ? rd.notes[ch.id] + '\n' + note : note;
    if (k + 1 >= parts.length) { rd.read = [...new Set([...(rd.read || []), ch.id])]; rd.part = null; }
    else rd.part = { ch: ch.id, k: k + 1 };
    rd.tries = 0; rd.next = 0; rd.last = Date.now();
    D.setReaders(b.id, rdAll);
    // 他回了别的角色：那个人可能回他一句（只回一层）
    const jobs = [];
    for (const r of replies) {
      const t = all.find((y) => y.id === r.to);
      if (t.who !== 'me' && D.charById(t.who) && Math.random() < 0.5) jobs.push({ book: b.id, who: t.who, cm: r.id, kind: 'reply', due: Date.now() + rand(3, 20) * MIN, last: true });
    }
    if (jobs.length) D.setBookJobs([...D.bookJobs(), ...jobs]);
    const toMe = replies.find((r) => all.find((y) => y.id === r.to)?.who === 'me');
    if (toMe) D.emit('notify', { book: b.id, ch: ch.id, who: cid, text: `回复了你的段评：${toMe.text}` });
    else if (added.length) D.emit('notify', { book: b.id, ch: ch.id, who: cid, text: `《${b.title}》第 ${nx.idx + 1} 章 · ${added[0].text}` });
  } finally {
    setNow(null, b.id);
  }
}

async function replyJob(job) {
  const b = D.bookById(job.book), c = D.charById(job.who);
  const cm = b && D.bookCmts(b.id).find((x) => x.id === job.cm);
  if (!b || !c || !cm) return;
  const j = parseJSON(await ask(c, C.buildReadReply(c, b, cm, job.kind), 400)) || {};
  const text = String(j.reply || '').trim();
  const all = D.bookCmts(b.id);
  if (!text || !all.some((x) => x.id === cm.id)) return;
  const r = { id: D.uid(), ch: cm.ch, p: cm.p, who: c.id, to: cm.id, text, ts: Date.now(), fresh: true };
  D.setBookCmts(b.id, [...all, r]);
  if (cm.who === 'me') D.emit('notify', { book: b.id, ch: cm.ch, who: c.id, text: `回复了你的段评：${text}` });
  else if (!job.last && D.charById(cm.who) && Math.random() < 0.4) D.setBookJobs([...D.bookJobs(), { book: b.id, who: cm.who, cm: r.id, kind: 'reply', due: Date.now() + rand(3, 20) * MIN, last: true }]);
}

/** 整本读完：阅读日记，进他的日记（带上是哪本书）。日记里新知道的关于你的事也记进备忘录 */
async function reviewJob(b, cid) {
  const c = D.charById(cid);
  if (!c) return;
  setNow({ book: b.id, who: cid, ch: 'review' }, b.id);
  try {
    const j = parseJSON(await ask(c, C.buildReadReview(c, b), 2200));
    if (!j || !String(j.diary || '').trim()) throw new Error('阅读日记没写成');
    const rdAll = D.readers(b.id);
    if (!rdAll[cid] || !D.charById(cid)) return;
    const d = { id: D.uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : ymd(), ts: Date.now(), text: String(j.diary).trim(), inner: String(j.inner || '').trim(), keys: arr(j.keywords).map(String).filter(Boolean).slice(0, 12), book: b.id, bookTitle: b.title };
    D.setDiaries(cid, [...D.diaries(cid), d]);
    const memo = D.memos(cid);
    const add = arr(j.memo_add).map(String).map((s) => s.trim()).filter(Boolean).filter((s) => !memo.some((m) => m.text === s));
    if (add.length) D.setMemos(cid, [...memo, ...add.map((text) => ({ id: D.uid(), text, ts: Date.now(), auto: true }))]);
    rdAll[cid].review = d.id;
    rdAll[cid].last = Date.now();
    D.setReaders(b.id, rdAll);
    D.emit('notify', { diary: cid, text: `${D.nameOf(c)}写了《${b.title}》的阅读日记` });
  } finally {
    setNow(null, b.id);
  }
}

// ── 补算：一次只做一件费时的事。先回段评，再读下一章 / 写阅读日记（谁等得最久先轮到谁）──
let running = false;
export async function readTick() {
  if (running || !D.api().base) return;
  running = true;
  try {
    const acc = D.curAccount().id;
    const jobs = D.bookJobs().filter((j) => D.bookById(j.book) && D.charById(j.who));
    if (jobs.length !== D.bookJobs().length) D.setBookJobs(jobs);
    const due = jobs.find((j) => j.due <= Date.now() && D.bookById(j.book).acc === acc);
    if (due) {
      // 先从队列里拿掉，失败了也不反复重试
      D.setBookJobs(D.bookJobs().filter((j) => !(j.book === due.book && j.who === due.who && j.cm === due.cm && j.due === due.due)));
      try { await replyJob(due); } catch (e) { console.warn('段评', e.message); if (e.kind === 'config' || e.kind === 'network') throw e; }
      return;
    }
    const cands = [];
    for (const b of D.booksOf(acc)) {
      for (const [cid, rd] of Object.entries(D.readers(b.id))) {
        if (!D.charById(cid) || (rd.next || 0) > Date.now()) continue;
        if (nextOf(b, rd)) cands.push({ b, cid, rd, kind: 'read' });
        else if (b.done && !rd.review && finished(b, rd)) cands.push({ b, cid, rd, kind: 'review' });
      }
    }
    if (!cands.length) return;
    cands.sort((x, y) => (x.rd.last || x.rd.joined || 0) - (y.rd.last || y.rd.joined || 0));
    const x = cands[0];
    try {
      if (x.kind === 'read') await readJob(x.b, x.cid); else await reviewJob(x.b, x.cid);
    } catch (e) {
      console.warn('读书', e.message);
      // 没成：过一会儿再试（越往后隔得越久，最多一小时）
      const rdAll = D.readers(x.b.id), rd = rdAll[x.cid];
      if (rd) { rd.tries = (rd.tries || 0) + 1; rd.next = Date.now() + Math.min(60, 2 * 2 ** Math.min(rd.tries, 5)) * MIN; rd.last = Date.now(); D.setReaders(x.b.id, rdAll); }
      if (e.kind === 'config' || e.kind === 'network') throw e;
    }
  } finally {
    running = false;
  }
}
let kt = 0;
/** 马上叫一次（翻到新的一章、刚加入、加了一章）。和其他后台的事一样排队 */
export function kick(ms = 1500) {
  clearTimeout(kt);
  kt = setTimeout(() => queue(readTick).catch((e) => console.warn('读书', e.message)), ms);
}
