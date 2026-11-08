// 让角色回消息（手机聊天和线下都在这）。界面关掉也会接着生成完，结果写进存档。
import * as D from './data.js';
import { chat } from './api.js';
import * as C from './context.js';
import { parseChat, stripThink, partPreview, partText, quoteText } from './parse.js';
import { schedulePostReacts } from './life.js';
import { charMail } from './mail.js';
import { webSearch, searchReady } from './search.js';

const running = new Map(); // key -> AbortController
export const busy = (key) => running.has(key);
// 正在联网搜索的对话（聊天页标题下面显示「正在搜索…」）
const searching = new Set();
const SEARCH_LINE = /^\s*[\[【]\s*(搜索|搜|查|查一下|联网搜索)[\s\]】]/;
export const isSearching = (cid) => searching.has(cid);
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
  // 他正在写的这条被你删了（或者聊天记录全删了）：停下，什么都不留、不发通知
  const gone = () => !D.msgs(cid).includes(rec);
  D.touchMsgs(cid);
  D.emit('typing', cid);
  try {
    const g = D.genOf(c);
    // 设了搜索、又不是他主动来找你：他可以先 [搜索 关键词]，搜完再回（只搜一次）
    const canSearch = searchReady() && !away;
    let before = [], acts0 = [], search = null, text = '';
    for (let round = 0; round < 2; round++) {
      let shown = -1, cutAt = -1;
      text = await chat(C.buildChat(c, { extra, uptoId, skipId: regen ? null : rec.id, canSearch: canSearch && round === 0, search }), {
        signal: ctrl.signal, temperature: g.temperature, max_tokens: g.maxTokens,
        onDelta: (_, all) => {
          if (gone()) { ctrl.abort(); return; }
          // 只把已经写完的整行变成气泡，正在写的那行先不出；写了 [搜索] 以后的都不出
          const lines = stripThink(all).split('\n');
          lines.pop();
          const { parts, acts } = parseChat(lines.join('\n'));
          if (cutAt < 0 && round === 0 && canSearch && acts.some((a) => a.act === 'search')) cutAt = parts.length;
          const vis = cutAt >= 0 ? parts.slice(0, cutAt) : parts;
          if (vis.length !== shown) { shown = vis.length; rec.alts[rec.cur] = [...before, ...vis]; D.touchMsgs(cid); }
        },
      });
      const { parts, acts } = parseChat(text);
      const sq = round === 0 && canSearch && acts.find((a) => a.act === 'search');
      if (!sq) {
        if (away && !before.length && /^[\s（(]*不发[\s)）。.]*$/.test(stripThink(text))) { rec.alts[rec.cur] = []; return null; }
        before = [...before, ...parts];
        acts0 = [...acts0, ...acts.filter((a) => a.act !== 'search')];
        break;
      }
      // 搜：先留下 [搜索] 那行之前说的，搜完带着结果再问一次
      const lines = stripThink(text).split('\n');
      const at = lines.findIndex((l) => SEARCH_LINE.test(l));
      before = at > 0 ? parseChat(lines.slice(0, at).join('\n')).parts : [];
      acts0 = acts.filter((a) => a.act !== 'search');
      rec.alts[rec.cur] = before;
      searching.add(cid);
      D.emit('typing', cid);
      search = { q: sq.q, said: before.map(partText).join('\n') };
      try { const r = await webSearch(sq.q, { signal: ctrl.signal }); search.results = r.text; }
      catch (e) { if (ctrl.signal.aborted) throw e; search.error = e.message; D.emit('searchfail', { cid, msg: e.message }); }
      finally { searching.delete(cid); D.emit('typing', cid); }
    }
    if (gone()) return null;
    if (!before.length && !acts0.length && !away) throw new Error('这次回复是空的');
    rec.alts[rec.cur] = before;
    finish(c, rec, acts0);
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
    if (!ctrl.signal.aborted && !gone() && !rec.error && !away && D.partsOf(rec).length && lastIsMe(cid)) autoReply(cid, 1200);
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

// 引用的是谁的话：从后往前找哪条消息里有这几个字。prefer = 先在谁说过的话里找（他引用的多半是你的话）
export function quoteWho(cid, text, beforeId = null, prefer = null) {
  const key = String(text || '').replace(/…$/, '').slice(0, 12);
  let list = D.msgs(cid);
  if (beforeId) { const i = list.findIndex((r) => r.id === beforeId); if (i >= 0) list = list.slice(0, i); }
  for (const only of prefer ? [prefer, null] : [null]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (r.role === 'note' || (only && r.role !== only)) continue;
      if (D.partsOf(r).some((p) => quoteText(p).includes(key))) return r.role;
    }
  }
  return 'me';
}

// 回复写完以后：照片进相册、日程进日历、处理转账、发动态、加未读、发通知
function finish(c, rec, acts) {
  const parts = D.partsOf(rec);
  for (const p of parts) {
    if (p.t === 'photo') D.addPhoto({ acc: c.acc, desc: p.desc, who: c.id });
    if (p.t === 'event') D.addEvent({ date: p.date, title: p.title, yearly: p.yearly, by: c.id });
    if (p.quote && !p.quote.who) p.quote.who = quoteWho(c.id, p.quote.text, rec.id, 'me');
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
    // 他不知道你的邮箱就发不出去（提示词里也不会告诉他有这个格式）
    if (a.act === 'mail' && C.knowsMyMail(c) && D.charAddr(c)) {
      charMail(c, { subject: a.subject, body: a.body });
      note(c.id, `${D.nameOf(c)}给你发了一封邮件`);
    }
  }
  if (parts.length && !isViewing(c.id)) {
    D.setMeta(c.id, { unread: D.meta(c.id).unread + parts.length });
    D.emit('notify', { cid: c.id, text: partPreview(parts[parts.length - 1]) });
  }
}

export function note(cid, text) { return D.addMsg(cid, { role: 'note', alts: [[{ t: 'note', text }]] }); }

// ── 删聊天记录 ──
// 删掉的就从记录里没了，他下次回复时看到的上文里也就没有这段（上文每次都是从记录现拼的，见 context.js）。
/**
 * 删一部分：drop(记录, 第几个部件) 为 true 的删掉。
 * 一条整个删光了，紧跟在它后面的系统小字（「已收下转账」「发布了一条新动态」这种）也一起删，不留在上文里。
 */
export function removeParts(cid, drop) {
  const left = [];
  let goneBefore = false;
  for (const r of D.msgs(cid)) {
    if (r.role === 'note') { if (!goneBefore) left.push(r); continue; }
    const parts = D.partsOf(r);
    const keep = parts.filter((_, i) => !drop(r, i));
    const cut = keep.length !== parts.length;
    // 删光了就整条去掉；他正在写的那条，删了其中一个就整条去掉（他也就停下了）
    goneBefore = cut && (!keep.length || !!r.pending);
    if (goneBefore) continue;
    if (cut) r.alts[r.cur || 0] = keep;
    left.push(r);
  }
  D.setMsgs(cid, left);
}
/** 全删（日记、备忘录不动）。他正在回的那条也停下 */
export function clearChat(cid) {
  clearTimeout(autoT.get(cid));
  autoT.delete(cid);
  D.setMsgs(cid, []);
  stop(cid);
  D.setMeta(cid, { unread: 0 });
}

/** 你发一条（可以是几个部件）。发完他会自动回 */
export function send(cid, parts) {
  const rec = D.addMsg(cid, { role: 'me', alts: [parts] });
  const c = D.charById(cid);
  for (const p of parts) if (p.t === 'photo') D.addPhoto({ acc: c?.acc, desc: p.desc, who: 'me' });
  // 你在聊天里把自己的邮箱发给他了：他就记住了
  const addr = c && D.myAddr(D.accounts().find((a) => a.id === c.acc));
  if (addr && c.knowMail !== addr && parts.some((p) => (p.text || '').toLowerCase().includes(addr))) D.saveChar({ ...c, knowMail: addr });
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
    const g = C.storyGen(st);
    await chat(C.buildOffline(st, { uptoId }), {
      signal: ctrl.signal, temperature: g.temperature, max_tokens: g.maxTokens,
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
