// 数据模型：账号、角色、聊天、动态、日记、备忘录、日历、相册、线下剧情。
// 界面只通过这里读写；改了什么就 emit 一个事件，打开着的页面自己刷新。
import * as S from './store.js';
export { on, emit } from './store.js';
import { emit } from './store.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const now = () => Date.now();

// ── 设置 ──
const SETTINGS = {
  temperature: 0.9,
  maxTokens: 1500,
  histLen: 40,          // 聊天时带最近多少条记录
  // 下面这几项现在每个角色单独设（角色资料里），这里只当老存档的默认值
  proactive: true, awayHours: 6, charPosts: true, autoDiary: true, quietFrom: 1, quietTo: 8,
};
export const settings = () => ({ ...SETTINGS, ...S.get('settings', {}) });
export function setSettings(patch) { S.set('settings', { ...S.get('settings', {}), ...patch }); emit('settings'); }

export const api = () => ({ base: '', model: '', ...S.get('api', {}), key: S.get('secret.apiKey', '') });
export function setApi({ base, model, key }) {
  S.set('api', { base: base ?? api().base, model: model ?? api().model });
  if (key != null) S.set('secret.apiKey', key);
  emit('api');
}

export const lockConf = () => ({ pass: '', ...S.get('lock', {}) });
export function setLock(patch) { S.set('lock', { ...lockConf(), ...patch }); }

export const file = (k) => S.get('file.' + k, null);
export function setFile(k, v) { if (v == null) S.del('file.' + k); else S.set('file.' + k, v); emit('file', k); }
// 壁纸模糊度（px），键和 file 一样：wallLock / wallHome
export const wallBlur = (k) => S.get('wallBlur', {})[k] || 0;
export function setWallBlur(k, v) { S.set('wallBlur', { ...S.get('wallBlur', {}), [k]: v }); emit('file', k); }

// ── 账号（你的身份）──
export const accounts = () => S.get('accounts', []);
export function curAccount() {
  let list = accounts();
  if (!list.length) {
    list = [{ id: uid(), name: '我', avatar: null, sign: '', persona: '', world: '', cover: null, bubble: 'ink', createdAt: now() }];
    S.set('accounts', list);
    S.set('curAcc', list[0].id);
  }
  return list.find((a) => a.id === S.get('curAcc')) || list[0];
}
export function switchAccount(id) { S.set('curAcc', id); emit('account'); }
export function saveAccount(a) {
  const list = accounts();
  const i = list.findIndex((x) => x.id === a.id);
  if (i < 0) list.push(a); else list[i] = a;
  S.set('accounts', list);
  emit('account');
  return a;
}
export function newAccount(name = '新身份') {
  const a = { id: uid(), name, avatar: null, sign: '', persona: '', world: '', cover: null, bubble: 'ink', createdAt: now() };
  saveAccount(a);
  return a;
}
export function removeAccount(id) {
  for (const c of S.get('chars', []).filter((c) => c.acc === id)) removeChar(c.id, true);
  S.set('moments', moments().filter((m) => m.acc !== id));
  S.set('photos', photos().filter((p) => p.acc !== id));
  for (const st of stories().filter((s) => s.acc === id)) removeStory(st.id, true);
  S.set('accounts', accounts().filter((a) => a.id !== id));
  if (S.get('curAcc') === id) S.set('curAcc', accounts()[0]?.id || null);
  emit('account');
}

// ── 角色 ──
export const allChars = () => S.get('chars', []);
export const chars = (acc = curAccount().id) => allChars().filter((c) => c.acc === acc);
export const charById = (id) => allChars().find((c) => c.id === id) || null;
// 显示用的名字：你给的备注 > 他自己起的网名 > 名字（像聊天软件那样）
export const nameOf = (c) => (c ? c.nick || c.net || c.name || '未命名' : '');
export function newChar(acc = curAccount().id) {
  return { id: uid(), acc, name: '', nick: '', avatar: null, persona: '', net: '', sign: '', knows: [], life: lifeOf({}), createdAt: now() };
}
// 他的生活（每个角色单独设）：多久没聊来找你、多久发一条动态、多久写一篇日记、几点到几点别打扰
export function lifeOf(c) {
  const st = settings();
  return {
    away: st.proactive, awayHours: st.awayHours,
    post: st.charPosts, postHours: 24,
    diary: st.autoDiary, diaryHours: 20,
    quietFrom: st.quietFrom, quietTo: st.quietTo,
    ...(c?.life || {}),
  };
}
export function saveChar(c) {
  const list = allChars();
  const i = list.findIndex((x) => x.id === c.id);
  if (i < 0) list.push(c); else list[i] = c;
  S.set('chars', list);
  emit('chars');
  return c;
}
export function removeChar(id, quiet) {
  S.set('chars', allChars().filter((c) => c.id !== id).map((c) => ({ ...c, knows: (c.knows || []).filter((k) => k !== id) })));
  for (const k of ['msgs.', 'diary.', 'memo.']) S.del(k + id);
  const m = S.get('chatmeta', {}); delete m[id]; S.set('chatmeta', m);
  S.set('moments', moments().filter((x) => x.who !== id).map((x) => ({ ...x, likes: x.likes.filter((w) => w !== id), comments: x.comments.filter((c) => c.who !== id), jobs: (x.jobs || []).filter((j) => j.who !== id) })));
  for (const st of stories().filter((s) => s.char === id)) removeStory(st.id, true);
  if (!quiet) emit('chars');
}

// ── 聊天记录 ──
// 一条记录 { id, role:'me'|'them'|'note', ts, alts:[[部件...]], cur }
// 部件 { t:'text', text, quote? } { t:'voice', text, tone, sec, quote? } { t:'sticker', name } { t:'photo', desc }
//      { t:'pay', amount, note, state } { t:'event', date, title, yearly } { t:'note', text }
//      （老存档里可能还有 t:'red'，按转账显示）  quote = { who:'me'|'them', text }
export const msgs = (cid) => S.get('msgs.' + cid, []);
export function setMsgs(cid, arr) { S.set('msgs.' + cid, arr); emit('msgs', cid); }
export function addMsg(cid, rec) {
  const arr = msgs(cid);
  rec = { id: uid(), ts: now(), cur: 0, ...rec };
  arr.push(rec);
  S.set('msgs.' + cid, arr);
  setMeta(cid, { lastTs: rec.ts });
  emit('msgs', cid);
  return rec;
}
export const partsOf = (rec) => rec.alts?.[rec.cur || 0] || [];
export function touchMsgs(cid) { S.touch('msgs.' + cid); emit('msgs', cid); }

export const meta = (cid) => ({ unread: 0, pinned: false, lastTs: 0, ...(S.get('chatmeta', {})[cid] || {}) });
export function setMeta(cid, patch) {
  const all = S.get('chatmeta', {});
  all[cid] = { ...(all[cid] || {}), ...patch };
  S.set('chatmeta', all);
  emit('meta', cid);
}

// ── 动态 ──
// { id, acc, who:'me'|角色id, text, photos:[描述], ts, likes:[who], comments:[{id, who, to, text, ts}], jobs:[{kind, who, due, to}] }
export const moments = () => S.get('moments', []);
export const momentsOf = (acc = curAccount().id) => moments().filter((m) => m.acc === acc).sort((a, b) => b.ts - a.ts);
export function saveMoment(m) {
  const list = moments();
  const i = list.findIndex((x) => x.id === m.id);
  if (i < 0) list.push(m); else list[i] = m;
  S.set('moments', list);
  emit('moments');
  return m;
}
export function removeMoment(id) { S.set('moments', moments().filter((m) => m.id !== id)); emit('moments'); }

// ── 日记 / 备忘录 ──
// 日记 { id, date:'YYYY-MM-DD', ts, text, inner, keys:[关键词] }
export const diaries = (cid) => S.get('diary.' + cid, []);
export function setDiaries(cid, arr) { S.set('diary.' + cid, arr); emit('diary', cid); }
// 备忘录 { id, text, ts }
export const memos = (cid) => S.get('memo.' + cid, []);
export function setMemos(cid, arr) { S.set('memo.' + cid, arr); emit('memo', cid); }

// ── 日历（整台手机共用）── { id, date, title, note, yearly, done:[打过勾的日期], by?:角色id }
export const events = () => S.get('events', []);
export function setEvents(arr) { S.set('events', arr); emit('events'); }
const pad2 = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
/** 某件事在 from 当天或之后最近的一次（每年的往后找） */
export function nextDate(e, from = today()) {
  if (!e.yearly) return e.date;
  const y = Number(from.slice(0, 4));
  let d = `${y}${e.date.slice(4)}`;
  if (d < from) d = `${y + 1}${e.date.slice(4)}`;
  return d;
}
/** 从今天起 days 天内的日程：[{ e, at, done }]，按日期排 */
export function upcoming(days = 3660) {
  const t = today(), lim = new Date(Date.now() + days * 86400000);
  const end = `${lim.getFullYear()}-${pad2(lim.getMonth() + 1)}-${pad2(lim.getDate())}`;
  return events().map((e) => { const at = nextDate(e, t); return { e, at, done: isDone(e, at) }; })
    .filter((x) => x.at >= t && x.at <= end)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.done - b.done)); // 同一天没做完的在前
}
export const eventsOn = (date) => events().filter((e) => (e.yearly ? e.date.slice(5) === date.slice(5) && e.date <= date : e.date === date));
export const isDone = (e, date) => (e.done || []).includes(date);
export function toggleDone(id, date) {
  setEvents(events().map((e) => (e.id !== id ? e : { ...e, done: isDone(e, date) ? e.done.filter((d) => d !== date) : [...(e.done || []), date] })));
}
/** 加一件事（角色记的也走这里）；同一天同名的不重复加。返回那件事 */
export function addEvent({ date, title, note = '', yearly = false, by = null }) {
  const same = events().find((e) => e.title === title && (yearly ? e.yearly && e.date.slice(5) === date.slice(5) : e.date === date));
  if (same) return same;
  const e = { id: uid(), date, title, note, yearly, done: [], by };
  setEvents([...events(), e]);
  return e;
}

// ── 表情包（所有身份、所有角色共用）── { id, name（这张是什么意思）, src }
export const stickers = () => S.get('stickers', []);
export function setStickers(arr) { S.set('stickers', arr); emit('stickers'); }
/** 按名字找：先找一模一样的，再找互相包含的 */
export function stickerByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const all = stickers();
  return all.find((x) => x.name === n) || all.filter((x) => x.name.includes(n) || n.includes(x.name)).sort((a, b) => b.name.length - a.name.length)[0] || null;
}

// ── 相册 ── { id, acc, desc, who, ts }
export const photos = () => S.get('photos', []);
export const photosOf = (acc = curAccount().id) => photos().filter((p) => p.acc === acc).sort((a, b) => b.ts - a.ts);
export function addPhoto(p) {
  const list = photos();
  const rec = { id: uid(), acc: curAccount().id, ts: now(), who: 'me', ...p };
  list.push(rec);
  S.set('photos', list);
  emit('photos');
  return rec;
}
export function setPhotos(arr) { S.set('photos', arr); emit('photos'); }

// ── 线下剧情 ── { id, acc, char, title, scene, createdAt, lastTs }，记录在 story.<id>，结构和聊天一样（部件只有 text）
export const stories = () => S.get('stories', []);
export const storiesOf = (acc = curAccount().id) => stories().filter((s) => s.acc === acc).sort((a, b) => (b.lastTs || b.createdAt) - (a.lastTs || a.createdAt));
export function saveStory(st) {
  const list = stories();
  const i = list.findIndex((x) => x.id === st.id);
  if (i < 0) list.push(st); else list[i] = st;
  S.set('stories', list);
  emit('stories');
  return st;
}
export function removeStory(id, quiet) { S.set('stories', stories().filter((s) => s.id !== id)); S.del('story.' + id); if (!quiet) emit('stories'); }
export const storyMsgs = (id) => S.get('story.' + id, []);
export function setStoryMsgs(id, arr) { S.set('story.' + id, arr); const st = stories().find((s) => s.id === id); if (st) { st.lastTs = now(); S.touch('stories'); } emit('story', id); }

// ── 主屏幕布局 ──
export const layout = () => S.get('layout', null);
export function setLayout(l) { S.set('layout', l); }

// ── 天气 ──
export const weatherConf = () => S.get('weather', null);
export function setWeatherConf(w) { S.set('weather', w); emit('weather'); }
