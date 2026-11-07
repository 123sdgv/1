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
  proactive: true,      // 离开久了角色会来找你
  awayHours: 6,         // 离开多少小时算久
  charPosts: true,      // 角色自己发动态
  autoDiary: true,      // 角色自动写日记
  quietFrom: 1, quietTo: 8, // 这段时间角色不来找你（几点到几点）
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
  return { id: uid(), acc, name: '', nick: '', avatar: null, persona: '', net: '', sign: '', knows: [], createdAt: now() };
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
// 部件 { t:'text', text } { t:'photo', desc } { t:'red', amount, note, state } { t:'pay', amount, note, state } { t:'note', text }
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

// ── 日历（整台手机共用）── { id, date, title, note, yearly }
export const events = () => S.get('events', []);
export function setEvents(arr) { S.set('events', arr); emit('events'); }

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
