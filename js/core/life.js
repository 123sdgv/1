// 角色不在你眼前时的生活：写日记、回动态、发动态、很久没聊来找你、给自己起网名。
// 网页关掉就什么都不跑，所以每次打开（和开着的时候每隔一会儿）按时间补算。
import * as D from './data.js';
import { chat, queue } from './api.js';
import * as C from './context.js';
import { parseJSON } from './parse.js';
import { reply as charReply } from './chat.js';
import { ymd } from './time.js';
import { getWeather } from './weather.js';

const MIN = 60000, HOUR = 60 * MIN;
const rand = (a, b) => a + Math.random() * (b - a);
const ask = (msgs, max = 900) => chat(msgs, { stream: false, max_tokens: max, temperature: 0.9 });

// ── 动态：安排谁什么时候来点赞评论 ──
/** 你发了动态：这个账号的角色大多会来看看 */
export function scheduleMyPostReacts(m) {
  m.jobs ||= [];
  for (const c of D.chars(m.acc)) if (Math.random() < 0.85) m.jobs.push({ kind: 'react', who: c.id, due: Date.now() + rand(2, 15) * MIN });
  D.saveMoment(m);
}
/** 角色发了动态：认识他的角色会来看看 */
export function schedulePostReacts(m) {
  m.jobs ||= [];
  for (const c of D.chars(m.acc)) if (c.id !== m.who && (c.knows || []).includes(m.who) && Math.random() < 0.7) m.jobs.push({ kind: 'react', who: c.id, due: Date.now() + rand(5, 40) * MIN });
  D.saveMoment(m);
}
/** 你评论/回复了：被回复的角色（或者动态主人）过一会儿回你 */
export function scheduleReplyTo(m, cm) {
  const target = cm.to && cm.to !== 'me' ? cm.to : m.who !== 'me' ? m.who : null;
  if (!target || !D.charById(target)) return;
  m.jobs ||= [];
  m.jobs.push({ kind: 'reply', who: target, cid: cm.id, due: Date.now() + rand(1, 5) * MIN });
  D.saveMoment(m);
}

async function runJob(m, job) {
  const c = D.charById(job.who);
  if (!c) return;
  if (job.kind === 'react') {
    const j = parseJSON(await ask(C.buildReact(c, m), 400)) || {};
    const fresh = D.moments().find((x) => x.id === m.id);
    if (!fresh) return;
    if (j.like && !fresh.likes.includes(c.id)) fresh.likes.push(c.id);
    if (j.comment && String(j.comment).trim()) {
      const cm = { id: D.uid(), who: c.id, to: null, text: String(j.comment).trim(), ts: Date.now() };
      fresh.comments.push(cm);
      // 角色评论了另一个角色的动态：动态主人可能回一句（只回一层，不会没完没了）
      if (fresh.who !== 'me' && fresh.who !== c.id && Math.random() < 0.45) fresh.jobs.push({ kind: 'reply', who: fresh.who, cid: cm.id, due: Date.now() + rand(3, 20) * MIN, last: true });
      if (fresh.who === 'me') D.emit('notify', { moment: fresh.id, text: `${D.nameOf(c)}评论了你的动态` });
    }
    D.saveMoment(fresh);
  } else if (job.kind === 'reply') {
    const fresh = D.moments().find((x) => x.id === m.id);
    const cm = fresh?.comments.find((x) => x.id === job.cid);
    if (!cm) return;
    const j = parseJSON(await ask(C.buildReply(c, fresh, cm), 400)) || {};
    if (j.reply && String(j.reply).trim()) {
      fresh.comments.push({ id: D.uid(), who: c.id, to: cm.who, text: String(j.reply).trim(), ts: Date.now() });
      if (cm.who === 'me') D.emit('notify', { moment: fresh.id, text: `${D.nameOf(c)}回复了你` });
      D.saveMoment(fresh);
    }
  }
}

async function momentJobs() {
  let done = 0;
  for (const m of D.momentsOf()) {
    for (const job of [...(m.jobs || [])]) {
      if (job.due > Date.now() || done >= 4) continue;
      // 先从队列里拿掉，失败了也不反复重试
      const fresh = D.moments().find((x) => x.id === m.id);
      if (!fresh) break;
      fresh.jobs = fresh.jobs.filter((j) => j !== job && !(j.kind === job.kind && j.who === job.who && j.due === job.due && j.cid === job.cid));
      D.saveMoment(fresh);
      try { await runJob(fresh, job); } catch (e) { console.warn('动态', e.message); if (e.kind === 'config' || e.kind === 'network') throw e; }
      done++;
    }
  }
}

// ── 日记 ──
export async function writeDiary(c, { force = false } = {}) {
  const ds = D.diaries(c.id);
  const since = ds.length ? ds[ds.length - 1].upto || ds[ds.length - 1].ts : 0;
  const log = C.diaryLog(c, since);
  if (!log.count) { if (force) throw new Error('上一篇日记之后还没发生什么'); return null; }
  const j = parseJSON(await ask(C.buildDiary(c, log), 2000));
  if (!j || !j.diary) throw new Error('这次日记没写成，过会儿再试');
  const d = { id: D.uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : ymd(log.last), ts: Date.now(), upto: log.last, text: String(j.diary).trim(), inner: String(j.inner || '').trim(), keys: (j.keywords || []).map(String).filter(Boolean).slice(0, 12) };
  D.setDiaries(c.id, [...D.diaries(c.id), d]);
  // 备忘录：删掉不对的、加上新的（用户手动加的也在里面，一样可能被删，所以只删模型点名的编号）
  const memo = D.memos(c.id);
  const drop = new Set((j.memo_remove || []).map((n) => memo[Number(n) - 1]?.id).filter(Boolean));
  const add = (j.memo_add || []).map(String).map((s) => s.trim()).filter(Boolean).filter((s) => !memo.some((m) => m.text === s));
  D.setMemos(c.id, [...memo.filter((m) => !drop.has(m.id)), ...add.map((text) => ({ id: D.uid(), text, ts: Date.now(), auto: true }))]);
  D.emit('notify', { diary: c.id, text: `${D.nameOf(c)}写了一篇日记` });
  return d;
}
function diaryDue(c, life) {
  const ds = D.diaries(c.id);
  const lastTs = ds.length ? ds[ds.length - 1].ts : c.createdAt || 0;
  const since = ds.length ? ds[ds.length - 1].upto || lastTs : 0;
  const log = C.diaryLog(c, since);
  if (log.count < 10) return false;
  if (Date.now() - log.last < 30 * MIN) return false; // 还在聊，别打断
  return Date.now() - lastTs > life.diaryHours * HOUR || log.count >= 150;
}

// ── 网名和签名 ──
export async function makeProfile(c) {
  const j = parseJSON(await ask(C.buildProfile(c), 300));
  if (!j) throw new Error('没起好，再试一次');
  const fresh = D.charById(c.id);
  if (!fresh) return null;
  fresh.net = String(j.net || fresh.net || '').trim().slice(0, 24);
  fresh.sign = String(j.sign || fresh.sign || '').trim().slice(0, 60);
  fresh.profileTried = true;
  D.saveChar(fresh);
  return fresh;
}

// ── 角色发动态 ──
export async function charPost(c) {
  const j = parseJSON(await ask(C.buildPost(c), 600));
  if (!j || !String(j.text || '').trim()) return null;
  const m = D.saveMoment({ id: D.uid(), acc: c.acc, who: c.id, text: String(j.text).trim(), photos: (j.photos || []).map(String).filter(Boolean).slice(0, 9), ts: Date.now(), likes: [], comments: [], jobs: [] });
  for (const p of m.photos) D.addPhoto({ acc: c.acc, desc: p, who: c.id });
  schedulePostReacts(m);
  return m;
}

// ── 主程序：一次补算（每个角色按自己资料里「他的生活」那几项来）──
const inQuiet = (L) => { const hr = new Date().getHours(); return L.quietFrom === L.quietTo ? false : L.quietFrom < L.quietTo ? hr >= L.quietFrom && hr < L.quietTo : hr >= L.quietFrom || hr < L.quietTo; };
let running = false, lastAway = 0;
export function tick() {
  if (running || !D.api().base) return;
  running = true;
  return queue(async () => {
    try {
      await getWeather().catch(() => {}); // 让角色知道的天气是新的（30 分钟内的用缓存）
      await momentJobs();
      const list = D.chars();
      // 网名签名还空着的，起一个
      for (const c of list) if (!c.profileTried && (!c.net || !c.sign) && c.name) { await makeProfile(c).catch((e) => { const f = D.charById(c.id); if (f) { f.profileTried = true; D.saveChar(f); } throw e; }); break; }
      for (const c of list) { const L = D.lifeOf(c); if (L.diary && diaryDue(c, L)) { await writeDiary(c).catch((e) => console.warn('日记', e.message)); break; } }
      for (const c of list) {
        const L = D.lifeOf(c);
        if (!L.post) continue;
        const m = D.meta(c.id);
        const next = m.nextPost || ((c.createdAt || Date.now()) + rand(3, 12) * HOUR);
        if (!m.nextPost) D.setMeta(c.id, { nextPost: next });
        if (Date.now() >= next && !inQuiet(L)) {
          D.setMeta(c.id, { nextPost: Date.now() + rand(0.7, 1.4) * L.postHours * HOUR });
          await charPost(c).catch((e) => console.warn('动态', e.message));
          break;
        }
      }
      if (Date.now() - lastAway > 10 * MIN) {
        const cands = list.filter((c) => {
          const L = D.lifeOf(c);
          if (!L.away || inQuiet(L)) return false;
          const ms = D.msgs(c.id), last = ms[ms.length - 1];
          if (!last) return false;
          const gap = Date.now() - last.ts;
          const m = D.meta(c.id);
          // 上一条已经是他主动发的、你还没回，就不再追着发
          return gap > L.awayHours * HOUR && Date.now() - (m.lastAway || 0) > L.awayHours * HOUR && !(last.role === 'them' && last.away);
        });
        if (cands.length && Math.random() < 0.6) {
          const c = cands[Math.floor(Math.random() * cands.length)];
          lastAway = Date.now();
          D.setMeta(c.id, { lastAway: Date.now() });
          await charReply(c.id, { away: true, extra: C.awayExtra(c) });
        }
      }
    } catch (e) {
      console.warn('补算停了：', e.message);
    } finally {
      running = false;
    }
  });
}
let iv = 0;
export function startLife() {
  clearInterval(iv);
  setTimeout(tick, 2500);
  iv = setInterval(tick, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(tick, 1500); });
}
