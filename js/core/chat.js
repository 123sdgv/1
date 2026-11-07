// 让角色回消息（手机聊天和线下都在这）。界面关掉也会接着生成完，结果写进存档。
import * as D from './data.js';
import { chat } from './api.js';
import * as C from './context.js';
import { parseChat, stripThink, partPreview, quoteText } from './parse.js';
import { schedulePostReacts } from './life.js';

const running = new Map(); // key -> AbortController
export const busy = (key) => running.has(key);
export function stop(key) { running.get(key)?.abort(); }

// 当前正看着的对话（看着的不加未读）
let viewing = null;
export const setViewing = (key) => { viewing = key; if (key) D.setMeta(key, { unread: 0 }); };
export const isViewing = (key) => viewing === key && !document.hidden;

/**
 * 角色回复。
 * regen：把最后一条角色回复重新生成一遍（多一个版本，可以左右翻）
 * extra：附加在最后的系统提示（主动发消息时用）
 * away：主动发消息模式，回「不发」就什么都不留
 */
export async function reply(cid, { regen = false, extra = null, away = false } = {}) {
  if (running.has(cid)) return null;
  const c = D.charById(cid);
  if (!c) return null;
  let rec, uptoId = null;
  if (regen) {
    rec = [...D.msgs(cid)].reverse().find((r) => r.role !== 'note');
    if (!rec || rec.role !== 'them') return null;
    uptoId = rec.id;
    rec.alts.push([]);
    rec.cur = rec.alts.length - 1;
    rec.ts = Date.now();
  } else {
    // 之前没回成、只剩一行报错的那条，这次重新回了就不留着
    const stale = D.msgs(cid).filter((r) => !(r.role === 'them' && r.error && !D.partsOf(r).length));
    if (stale.length !== D.msgs(cid).length) D.setMsgs(cid, stale);
    rec = D.addMsg(cid, { role: 'them', alts: [[]], away: away || undefined });
  }
  rec.pending = true;
  delete rec.error;
  const ctrl = new AbortController();
  running.set(cid, ctrl);
  D.touchMsgs(cid);
  D.emit('typing', cid);
  let shown = 0;
  try {
    const text = await chat(C.buildChat(c, { extra, uptoId }), {
      signal: ctrl.signal,
      onDelta: (_, all) => {
        // 只把已经写完的整行变成气泡，正在写的那行先不出
        const lines = stripThink(all).split('\n');
        lines.pop();
        const { parts } = parseChat(lines.join('\n'));
        if (parts.length !== shown) { shown = parts.length; rec.alts[rec.cur] = parts; D.touchMsgs(cid); }
      },
    });
    if (away && /^[\s（(]*不发[\s)）。.]*$/.test(stripThink(text))) { rec.alts[rec.cur] = []; return null; }
    const { parts, acts } = parseChat(text);
    if (!parts.length && !acts.length && !away) throw new Error('这次回复是空的');
    rec.alts[rec.cur] = parts;
    finish(c, rec, acts);
    return rec;
  } catch (e) {
    if (e.name !== 'AbortError') rec.error = e.message || '出错了';
    return null;
  } finally {
    rec.pending = false;
    running.delete(cid);
    if (!D.partsOf(rec).length && !rec.error) {
      if (regen && rec.alts.length > 1) { rec.alts.splice(rec.cur, 1); rec.cur = rec.alts.length - 1; }
      else D.setMsgs(cid, D.msgs(cid).filter((r) => r.id !== rec.id));
    }
    D.touchMsgs(cid);
    D.emit('typing', cid);
    // 他回的时候你又发了消息：接着回你后来说的
    if (!ctrl.signal.aborted && !rec.error && !away && D.partsOf(rec).length && lastIsMe(cid)) autoReply(cid, 1200);
  }
}

// ── 你发完消息他自动回：等你停一下（还在打字就再等等），连发几条也只回一次 ──
const autoT = new Map();
const lastIsMe = (cid) => [...D.msgs(cid)].reverse().find((r) => r.role !== 'note')?.role === 'me';
export function autoReply(cid, wait = 1800) {
  clearTimeout(autoT.get(cid));
  autoT.set(cid, setTimeout(() => {
    autoT.delete(cid);
    if (!running.has(cid) && lastIsMe(cid)) reply(cid);
  }, wait));
}
/** 输入框里在打字：他先别回 */
export function typing(cid) { if (autoT.has(cid)) autoReply(cid, 3500); }
export const waiting = (cid) => autoT.has(cid);

// 引用的是谁的话：从后往前找哪条消息里有这几个字
export function quoteWho(cid, text, beforeId = null) {
  const key = String(text || '').replace(/…$/, '').slice(0, 12);
  let list = D.msgs(cid);
  if (beforeId) { const i = list.findIndex((r) => r.id === beforeId); if (i >= 0) list = list.slice(0, i); }
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (r.role === 'note') continue;
    if (D.partsOf(r).some((p) => quoteText(p).includes(key))) return r.role;
  }
  return 'me';
}

// 回复写完以后：照片进相册、日程进日历、处理转账、发动态、加未读、发通知
function finish(c, rec, acts) {
  const parts = D.partsOf(rec);
  for (const p of parts) {
    if (p.t === 'photo') D.addPhoto({ acc: c.acc, desc: p.desc, who: c.id });
    if (p.t === 'event') D.addEvent({ date: p.date, title: p.title, yearly: p.yearly, by: c.id });
    if (p.quote && !p.quote.who) p.quote.who = quoteWho(c.id, p.quote.text, rec.id);
  }
  const list = D.msgs(c.id);
  // 你转给他、他还没处理的那笔（老存档里的红包也算）
  const waitPay = () => [...list].reverse().filter((r) => r.role === 'me').flatMap((r) => D.partsOf(r)).find((p) => (p.t === 'pay' && p.state === 'wait') || (p.t === 'red' && p.state === 'open'));
  for (const a of acts) {
    if (a.act === 'takePay') { const p = waitPay(); if (p) { p.state = 'taken'; note(c.id, `${D.nameOf(c)}已收下你的转账`); } }
    if (a.act === 'backPay') { const p = waitPay(); if (p) { p.state = 'back'; note(c.id, `${D.nameOf(c)}退还了你的转账`); } }
    if (a.act === 'post') {
      const m = D.saveMoment({ id: D.uid(), acc: c.acc, who: c.id, text: a.text, photos: [], ts: Date.now(), likes: [], comments: [], jobs: [] });
      schedulePostReacts(m);
      note(c.id, `${D.nameOf(c)}发布了一条新动态`);
    }
  }
  if (parts.length && !isViewing(c.id)) {
    D.setMeta(c.id, { unread: D.meta(c.id).unread + parts.length });
    D.emit('notify', { cid: c.id, text: partPreview(parts[parts.length - 1]) });
  }
}

export function note(cid, text) { return D.addMsg(cid, { role: 'note', alts: [[{ t: 'note', text }]] }); }

/** 你发一条（可以是几个部件）。发完他会自动回 */
export function send(cid, parts) {
  const rec = D.addMsg(cid, { role: 'me', alts: [parts] });
  for (const p of parts) if (p.t === 'photo') D.addPhoto({ acc: D.charById(cid)?.acc, desc: p.desc, who: 'me' });
  autoReply(cid);
  return rec;
}

// ── 线下 ──
export async function offlineReply(sid, { regen = false } = {}) {
  const key = 'story:' + sid;
  if (running.has(key)) return;
  const st = D.stories().find((s) => s.id === sid);
  if (!st) return;
  const list = D.storyMsgs(sid);
  let rec, uptoId = null;
  if (regen) {
    rec = list[list.length - 1];
    if (!rec || rec.role !== 'them') return;
    uptoId = rec.id;
    rec.alts.push([]);
    rec.cur = rec.alts.length - 1;
  } else {
    rec = { id: D.uid(), role: 'them', ts: Date.now(), alts: [[]], cur: 0 };
    list.push(rec);
  }
  rec.pending = true;
  delete rec.error;
  const ctrl = new AbortController();
  running.set(key, ctrl);
  D.setStoryMsgs(sid, list);
  D.emit('typing', key);
  try {
    await chat(C.buildOffline(st, { uptoId }), {
      signal: ctrl.signal,
      onDelta: (_, all) => { rec.alts[rec.cur] = [{ t: 'text', text: stripThink(all).trim() }]; D.setStoryMsgs(sid, list); },
    });
  } catch (e) {
    if (e.name !== 'AbortError') rec.error = e.message || '出错了';
  } finally {
    rec.pending = false;
    running.delete(key);
    const txt = D.partsOf(rec)[0]?.text;
    if (!txt && !rec.error) {
      if (regen && rec.alts.length > 1) { rec.alts.splice(rec.cur, 1); rec.cur = rec.alts.length - 1; }
      else list.splice(list.indexOf(rec), 1);
    }
    D.setStoryMsgs(sid, list);
    D.emit('typing', key);
  }
}
