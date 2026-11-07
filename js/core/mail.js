// 邮箱：你发信（发给角色的会被他读到、过一会儿回；发到没有的地址会退信）、他回信、他自己写信、他给自己起邮箱名。
// 和 life.js 一样，网页关着什么都不跑，打开时补算（life.js 的 tick 会调这里的 mailTick）。
import * as D from './data.js';
import { chat } from './api.js';
import * as C from './context.js';
import { parseJSON } from './parse.js';

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const rand = (a, b) => a + Math.random() * (b - a);
const ask = (c, msgs, max) => chat(msgs, { stream: false, max_tokens: max, temperature: D.genOf(c).temperature });
const accOf = (c) => D.accounts().find((a) => a.id === c.acc) || D.curAccount();

/** 你发一封信：存进「已发送」，再看收件人是谁 */
export function sendMail({ to, subject, body, draftId = null }) {
  const acc = D.curAccount();
  const from = D.myAddr(acc);
  to = String(to || '').trim().toLowerCase();
  const who = D.whoseAddr(to, acc);
  if (draftId) D.removeMail(draftId);
  const m = D.saveMail({ id: D.uid(), acc: acc.id, box: 'sent', from, fromName: acc.name || '我', to, subject, body, ts: Date.now(), read: true, char: who?.c?.id || null });
  if (who?.me) {
    D.saveMail({ ...m, id: D.uid(), box: 'inbox', read: false });
  } else if (who?.c) {
    const c = who.c;
    // 你给他写过信，他就知道你的邮箱了
    if (c.knowMail !== from) D.saveChar({ ...c, knowMail: from });
    D.setMailJobs([...D.mailJobs().filter((j) => !(j.who === c.id && j.kind === 'reply')), { kind: 'reply', who: c.id, mail: m.id, due: Date.now() + rand(3, 20) * MIN }]);
  } else {
    // 退信：像真的邮箱那样，系统马上退回一封
    D.saveMail({ id: D.uid(), acc: acc.id, box: 'inbox', from: 'postmaster@' + D.MAIL_DOMAIN, fromName: '邮件系统', to: from, ts: Date.now() + 1, read: false, char: null,
      subject: '退信：无法送达',
      body: `你发给 ${to || '（空）'} 的邮件没有送达：这个地址不存在。\n\n—— 原邮件 ——\n主题：${subject || '（无主题）'}\n\n${body}` });
  }
  return m;
}

/** 他写的一封信进你的收件箱 */
export function charMail(c, { subject, body }) {
  const acc = accOf(c);
  const m = D.saveMail({ id: D.uid(), acc: acc.id, box: 'inbox', from: D.charAddr(c), fromName: c.name || D.nameOf(c), to: D.myAddr(acc), subject: String(subject || '').trim() || '（无主题）', body: String(body || '').trim(), ts: Date.now(), read: false, char: c.id });
  D.emit('notify', { mail: m.id, text: `${m.fromName}：${m.subject}` });
  return m;
}

/** 他给自己起邮箱名 */
export async function makeMailName(c) {
  const j = parseJSON(await ask(c, C.buildMailName(c), 200));
  const local = String(j?.mail || '').toLowerCase().replace(/@.*$/, '').replace(/[^a-z0-9._]/g, '').replace(/^[._]+|[._]+$/g, '').slice(0, 20);
  const fresh = D.charById(c.id);
  if (!fresh) return null;
  if (local.length < 2) { fresh.mailTried = Date.now(); D.saveChar(fresh); throw new Error('邮箱名没起好'); }
  fresh.mail = D.freeMailName(local, c.id);
  D.saveChar(fresh);
  return fresh;
}

async function replyJob(job) {
  const c = D.charById(job.who);
  const mine = D.mails().find((m) => m.id === job.mail);
  if (!c || !mine || !D.charAddr(c)) return;
  const j = parseJSON(await ask(c, C.buildMailReply(c, mine), 1500));
  if (!j || j.reply === false || !String(j.body || '').trim()) return;
  const subject = String(j.subject || '').trim() || (/^re[:：]/i.test(mine.subject) ? mine.subject : 'Re: ' + (mine.subject || ''));
  charMail(c, { subject, body: j.body });
}
async function writeJob(c) {
  const j = parseJSON(await ask(c, C.buildMailWrite(c), 1500));
  if (!j || !String(j.body || '').trim()) return;
  charMail(c, { subject: j.subject, body: j.body });
}

/** 补算：起邮箱名、到时间的回信、他自己写信。一次最多做一件费时的事 */
export async function mailTick({ inQuiet }) {
  const list = D.chars();
  // 还没有邮箱的，起一个（没起成的隔一小时再试）
  for (const c of list) {
    if (c.mail || !c.name || Date.now() - (c.mailTried || 0) < HOUR) continue;
    await makeMailName(c).catch((e) => { console.warn('邮箱名', e.message); if (e.kind === 'config' || e.kind === 'network') throw e; });
    return;
  }
  // 回信
  const due = D.mailJobs().find((j) => j.due <= Date.now() && D.charById(j.who) && !inQuiet(D.lifeOf(D.charById(j.who))));
  if (due) {
    D.setMailJobs(D.mailJobs().filter((j) => j !== due));
    await replyJob(due).catch((e) => { console.warn('回信', e.message); if (e.kind === 'config' || e.kind === 'network') throw e; });
    return;
  }
  D.setMailJobs(D.mailJobs().filter((j) => D.charById(j.who)));
  // 自己写信：知道你的邮箱、打开了「自己写信」、到时间了
  for (const c of list) {
    const L = D.lifeOf(c);
    if (!L.mail || !c.mail || !C.knowsMyMail(c) || inQuiet(L)) continue;
    const m = D.meta(c.id);
    if (!m.nextMail) { D.setMeta(c.id, { nextMail: Date.now() + rand(0.5, 1.2) * L.mailDays * DAY }); continue; }
    if (Date.now() < m.nextMail) continue;
    D.setMeta(c.id, { nextMail: Date.now() + rand(0.7, 1.4) * L.mailDays * DAY });
    await writeJob(c).catch((e) => console.warn('写信', e.message));
    return;
  }
}
