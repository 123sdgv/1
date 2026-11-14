// 音乐 App 的逻辑（界面在 apps/music/）。不分身份：所有号共用一批歌、同一个评论区。
// - 歌词：认 .lrc（[mm:ss.xx] 一句一行，开头 [ti:] [ar:] [al:] 填歌名歌手，网易云那种「作词 : xx」「作曲 : xx」也认），纯文字歌词也行（按长度平均滚）。
// - 「假装在播」：没有声音，靠计时；转发按钮才跳到真的音乐 App。
// - 评论区：所有人匿名（名字、头像按种子算，同一个人在所有歌下面都一样）。
//   没推荐给谁、聊天里也没用《歌名》提过的歌 = 模型编两三个路人来评论；推荐给他 / 跟他聊天时提过 = 他也来（不知道哪个是你）。
//   你写评论 / 回复：他（或路人）过一会儿可能回、点赞。什么时候来都按打开网页时补算（life.js 的 tick 调 musicTick，一次做一件）。
import * as D from './data.js';
import { chat } from './api.js';
import * as C from './context.js';
import { parseJSON } from './parse.js';

const MIN = 60000;
const rand = (a, b) => a + Math.random() * (b - a);
const arr = (x) => (Array.isArray(x) ? x : []);

// ── 歌词 ──
const TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** .lrc / 纯文字 → { lines: [{t, text}], timed, title, artist, lyricist, composer } */
export function parseLyrics(raw) {
  const out = { lines: [], timed: false, title: '', artist: '', lyricist: '', composer: '' };
  const timedLines = [], plain = [];
  for (let line of String(raw || '').replace(/\r\n?/g, '\n').split('\n')) {
    line = line.trim();
    if (!line) continue;
    const tag = line.match(/^\[(ti|ar|al|by|offset|length|re|ve|au)\s*:(.*)\]$/i);
    if (tag) {
      const k = tag[1].toLowerCase(), v = tag[2].trim();
      if (k === 'ti') out.title = v;
      if (k === 'ar') out.artist = v;
      continue;
    }
    const times = [...line.matchAll(TIME)];
    const text = line.replace(TIME, '').trim();
    if (times.length) {
      out.timed = true;
      for (const m of times) timedLines.push({ t: +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3].padEnd(3, '0')) : 0), text });
    } else plain.push({ t: null, text });
  }
  out.lines = out.timed ? timedLines.sort((a, b) => a.t - b.t) : plain;
  // 作词 / 作曲那几行（网易云的 lrc 开头常有）：记下来，也留在歌词里（播放页上就是这样显示的）
  for (const l of out.lines.slice(0, 8)) {
    const m = l.text.match(/^(作词|词|作曲|曲)\s*[:：]\s*(.+)$/);
    if (m) { if (m[1].includes('词')) out.lyricist ||= m[2].trim(); else out.composer ||= m[2].trim(); }
  }
  out.lines = out.lines.filter((l) => l.text || out.timed);
  return out;
}
/** 歌词写回文字（编辑页里显示）：带时间的写回 lrc */
export function lyricsText(song) {
  const ls = song?.lines || [];
  if (!ls.some((l) => l.t != null)) return ls.map((l) => l.text).join('\n');
  const f = (t) => `[${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}]`;
  return ls.map((l) => f(l.t) + l.text).join('\n');
}
/** 一首歌多长（秒）：lrc 按最后一句再加 12 秒；纯文字按一句 4 秒；没歌词算 3 分半 */
export function durOf(lines) {
  if (!lines?.length) return 210;
  const last = [...lines].reverse().find((l) => l.t != null);
  return last ? Math.ceil(last.t + 12) : Math.max(60, lines.length * 4);
}
/** 现在唱到第几句：lrc 按时间；纯文字按长度平均分 */
export function lineAt(song, pos) {
  const ls = song?.lines || [];
  if (!ls.length) return -1;
  if (ls[0].t == null) return Math.min(ls.length - 1, Math.floor((pos / (song.dur || durOf(ls))) * ls.length));
  let i = -1;
  for (let k = 0; k < ls.length; k++) { if (ls[k].t <= pos + 0.05) i = k; else break; }
  return i;
}
/** 点了某一句：跳到那句的时间 */
export const timeOfLine = (song, i) => {
  const ls = song.lines || [];
  return ls[i]?.t != null ? ls[i].t : (i / Math.max(1, ls.length)) * (song.dur || durOf(ls));
};

// ── 匿名：名字（短的字母 + 数字）、头像（白底上一个对称的彩色小格子图，像刚注册时随机给的那种）──
function hash(s) { let x = 2166136261; for (const ch of String(s)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SYL = ['lu', 'mo', 'ka', 'ri', 'ne', 'so', 'vi', 'ta', 'ze', 'qi', 'po', 'xa', 'ju', 'mi', 'ro', 'ki', 'na', 'fe', 'yo', 'el', 'an', 'is', 'ou', 'ty'];
const COLORS = ['#F29BB6', '#7FCB9A', '#7FA8E8', '#F2C94C', '#B79BEA', '#F2A36B', '#6CC6C6'];
const anonCache = new Map();
/** who = 'me' / 角色id / 路人 id → { name, color, cells }（同一个人一直一样） */
export function anonOf(who) {
  if (anonCache.has(who)) return anonCache.get(who);
  const r = rng(hash(D.musicSeed() + '|' + who));
  let name = SYL[Math.floor(r() * SYL.length)] + SYL[Math.floor(r() * SYL.length)];
  if (r() < 0.5) name += SYL[Math.floor(r() * SYL.length)].slice(0, 1 + Math.floor(r() * 2));
  if (r() < 0.3) name = name[0].toUpperCase() + name.slice(1);
  const dig = Math.floor(r() * 4);
  if (dig) name += (r() < 0.25 ? '_' : '') + String(Math.floor(r() * 10 ** dig)).padStart(dig, '0');
  const cells = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (r() < 0.5) cells.push([x, y]);
  if (cells.length < 3) cells.push([1, 1], [0, 3], [2, 2]);
  const a = { name, color: COLORS[Math.floor(r() * COLORS.length)], cells };
  anonCache.set(who, a);
  return a;
}
/** 匿名头像（SVG 字符串） */
export function anonSvg(who) {
  const { color, cells } = anonOf(who);
  const rects = cells.flatMap(([x, y]) => (x === 2 ? [[2, y]] : [[x, y], [4 - x, y]])).map(([x, y]) => `<rect x="${10 + x * 16}" y="${10 + y * 16}" width="16" height="16"/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="#fff"/><g fill="${color}">${rects}</g></svg>`;
}

// ── 假装在播：没有声音，按计时走 ──
const st = { id: null, pos: 0, playing: false, at: 0 };
let timer = 0;
const tickPos = () => { if (!st.playing) return st.pos; return st.pos + (Date.now() - st.at) / 1000; };
export const nowPlaying = () => ({ id: st.id, pos: tickPos(), playing: st.playing });
function loop() {
  clearInterval(timer);
  if (!st.playing) return;
  timer = setInterval(() => {
    const s = D.songById(st.id);
    if (!s) { stop(); return; }
    if (tickPos() >= (s.dur || durOf(s.lines))) { st.pos = s.dur || durOf(s.lines); st.playing = false; clearInterval(timer); }
    D.emit('musicPos');
  }, 250);
}
function stop() { st.playing = false; clearInterval(timer); D.emit('musicPos'); }
/** 换一首（从头开始，不自动播） */
export function pick(id) { if (st.id === id) return; st.id = id; st.pos = 0; st.playing = false; clearInterval(timer); D.setMusicLast(id); D.emit('musicPos'); }
export function toggle() {
  const s = D.songById(st.id);
  if (!s) return;
  if (st.playing) { st.pos = tickPos(); st.playing = false; clearInterval(timer); }
  else { if (st.pos >= (s.dur || durOf(s.lines)) - 0.5) st.pos = 0; st.playing = true; st.at = Date.now(); loop(); }
  D.emit('musicPos');
}
export function seek(sec) {
  const s = D.songById(st.id);
  if (!s) return;
  st.pos = Math.max(0, Math.min(sec, s.dur || durOf(s.lines)));
  st.at = Date.now();
  D.emit('musicPos');
}

// ── 推荐给他 / 他在聊天里听说了 ──
/** 他知道这首歌了：排一次「去评论区看看」（推荐的过 2～10 分钟，聊天里提到的过 5～30 分钟） */
export function letKnow(songId, cid, { soon = true } = {}) {
  const s = D.songById(songId);
  if (!s || !D.charById(cid)) return;
  const first = !s.know?.[cid];
  D.saveSong({ ...s, know: { ...(s.know || {}), [cid]: Date.now() } });
  if (first && !D.songJobs().some((j) => j.song === songId && j.who === cid && j.kind === 'char')) {
    D.setSongJobs([...D.songJobs(), { song: songId, who: cid, kind: 'char', due: Date.now() + (soon ? rand(2, 10) : rand(5, 30)) * MIN }]);
  }
}
/** 新加了一首歌：排路人来评论（两三个人） */
export function scheduleCrowd(songId) {
  if (D.songJobs().some((j) => j.song === songId && j.kind === 'pass')) return;
  D.setSongJobs([...D.songJobs(), { song: songId, kind: 'pass', due: Date.now() + rand(1, 8) * MIN }]);
}

// ── 你写评论 ──
/** 你写一条（to = 回复哪条）。回的是他：他八成会回；回的是路人：那个路人可能回；直接写的：知道这首歌、评论过的人可能来回 / 点赞，路人也可能回一句 */
export function addMyComment(songId, { to = null, text = '', sticker = null }) {
  const all = D.songCmts(songId);
  const cm = { id: D.uid(), who: 'me', to, text, sticker, ts: Date.now(), likes: [], dislikes: [] };
  D.setSongCmts(songId, [...all, cm]);
  const target = to && all.find((x) => x.id === to);
  const jobs = [];
  const due = (a, b) => Date.now() + rand(a, b) * MIN;
  if (target && target.who !== 'me') {
    if (D.charById(target.who)) { if (Math.random() < 0.8) jobs.push({ song: songId, who: target.who, kind: 'reply', cm: cm.id, due: due(1, 6) }); }
    else if (target.who.startsWith('p.') && Math.random() < 0.6) jobs.push({ song: songId, who: target.who, kind: 'passReply', cm: cm.id, due: due(2, 15) });
  } else if (!target) {
    const s = D.songById(songId);
    const knowers = Object.keys(s?.know || {}).filter((cid) => D.charById(cid) && all.some((x) => x.who === cid));
    for (const cid of knowers) if (Math.random() < 0.5) jobs.push({ song: songId, who: cid, kind: 'reply', cm: cm.id, due: due(2, 15) });
    const pass = (s?.pass || []).filter((p) => all.some((x) => x.who === p));
    if (pass.length && Math.random() < 0.4) jobs.push({ song: songId, who: pass[Math.floor(Math.random() * pass.length)], kind: 'passReply', cm: cm.id, due: due(3, 25) });
  }
  if (jobs.length) D.setSongJobs([...D.songJobs(), ...jobs]);
  return cm;
}
/** 你点喜欢 / 不喜欢（再点一下取消；两个只能选一个） */
export function vote(songId, cmId, kind) {
  const all = D.songCmts(songId), x = all.find((y) => y.id === cmId);
  if (!x) return;
  const on = (x[kind] || []).includes('me');
  x.likes = (x.likes || []).filter((w) => w !== 'me');
  x.dislikes = (x.dislikes || []).filter((w) => w !== 'me');
  if (!on) x[kind].push('me');
  D.setSongCmts(songId, all);
}

// ── 补算：一次只做一件 ──
const ask = (msgs, max, c) => chat(msgs, { stream: false, max_tokens: max, temperature: c ? D.genOf(c).temperature : 1 });
let running = false;
export async function musicTick() {
  if (running || !D.api().base) return;
  running = true;
  try {
    heardInChat();
    const jobs = D.songJobs().filter((j) => D.songById(j.song) && (j.kind === 'pass' || j.kind === 'passReply' || D.charById(j.who)));
    if (jobs.length !== D.songJobs().length) D.setSongJobs(jobs);
    const job = jobs.filter((j) => j.due <= Date.now()).sort((a, b) => a.due - b.due)[0];
    if (!job) return;
    // 先拿掉；没成就放回去过一会儿再试（试 4 次）
    const same = (j) => j.song === job.song && j.kind === job.kind && j.who === job.who && j.cm === job.cm && j.due === job.due;
    D.setSongJobs(D.songJobs().filter((j) => !same(j)));
    try {
      if (job.kind === 'pass') await crowdJob(job);
      else if (job.kind === 'char') await charJob(job);
      else if (job.kind === 'reply') await replyJob(job);
      else if (job.kind === 'passReply') await passReplyJob(job);
    } catch (e) {
      console.warn('音乐评论', e.message);
      const tries = (job.tries || 0) + (e.kind === 'config' ? 0 : 1);
      if (tries < 4) D.setSongJobs([...D.songJobs(), { ...job, tries, due: Date.now() + (e.kind === 'config' ? 30 : 5 * 2 ** tries) * MIN }]);
      if (e.kind === 'config' || e.kind === 'network') throw e;
    }
  } finally {
    running = false;
  }
}

/** 聊天里（最近 30 条，你说的他说的都算）用《歌名》提到过的歌：他就知道了，过一会儿可能去评论区 */
function heardInChat() {
  const list = D.songs();
  if (!list.length) return;
  const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
  const byTitle = new Map(list.map((s) => [norm(s.title), s]));
  for (const c of D.allChars()) {
    const text = D.msgs(c.id).slice(-30).flatMap((r) => D.partsOf(r).map((p) => [p.text, p.desc, p.title].filter(Boolean).join(' '))).join('\n');
    for (const m of text.matchAll(/《([^《》\n]{1,40})》/g)) {
      const s = byTitle.get(norm(m[1]));
      if (s && !s.know?.[c.id]) letKnow(s.id, c.id, { soon: false });
    }
  }
}

const newPass = () => 'p.' + D.uid();
/** 路人：两三个人，一人一两条，可能互相回一句 */
async function crowdJob(job) {
  const s = D.songById(job.song);
  if (!s) return;
  const n = Math.random() < 0.5 ? 2 : 3;
  const j = parseJSON(await ask(C.buildSongCrowd(s, n), 900));
  const items = arr(j?.comments).filter((x) => String(x?.text || '').trim());
  if (!items.length) throw new Error('路人没评论成');
  const fresh = D.songById(job.song);
  if (!fresh) return;
  const ids = Array.from({ length: n }, newPass);
  const all = D.songCmts(job.song), t0 = Date.now() - items.length * 47000;
  const made = [];
  items.slice(0, 7).forEach((x, i) => {
    const who = ids[Math.min(n - 1, Math.max(0, (Number(x.who) || 1) - 1))];
    const to = Number(x.reply) > 0 ? made[Number(x.reply) - 1]?.id || null : null;
    made.push({ id: D.uid(), who, to, text: String(x.text).trim(), ts: t0 + i * 47000, likes: [], dislikes: [] });
  });
  // 路人之间顺手点几个赞
  for (const m of made) for (const w of ids) if (w !== m.who && Math.random() < 0.35) m.likes.push(w);
  D.setSongCmts(job.song, [...all, ...made]);
  D.saveSong({ ...fresh, pass: [...new Set([...(fresh.pass || []), ...made.map((m) => m.who)])] });
}

/** 他去评论区看看：写一两条、回几条、点几个赞（都匿名，他不知道哪个是你） */
async function charJob(job) {
  const s = D.songById(job.song), c = D.charById(job.who);
  if (!s || !c) return;
  const { msgs, nums } = C.buildSongChar(c, s);
  const j = parseJSON(await ask(msgs, 700, c));
  if (!j) throw new Error('他没评论成');
  const all = D.songCmts(job.song), t0 = Date.now();
  const add = [];
  for (const t of arr(j.comments).slice(0, 2)) { const text = String(typeof t === 'string' ? t : t?.text || '').trim(); if (text) add.push({ id: D.uid(), who: c.id, to: null, text, ts: t0 + add.length, likes: [], dislikes: [] }); }
  for (const x of arr(j.replies).slice(0, 3)) {
    const t = all.find((y) => y.id === nums[Number(String(x?.to ?? '').replace(/\D/g, ''))]);
    const text = String(x?.text || '').trim();
    if (t && text && t.who !== c.id) add.push({ id: D.uid(), who: c.id, to: t.id, text, ts: t0 + 10 + add.length, likes: [], dislikes: [] });
  }
  for (const n of arr(j.likes).slice(0, 5)) { const t = all.find((y) => y.id === nums[Number(String(n).replace(/\D/g, ''))]); if (t && t.who !== c.id && !(t.likes || []).includes(c.id)) (t.likes ||= []).push(c.id); }
  D.setSongCmts(job.song, [...all, ...add]);
}

/** 你回了他 / 你在他评论过的歌下面写了一条：他要不要回、点不点赞 */
async function replyJob(job) {
  const s = D.songById(job.song), c = D.charById(job.who);
  const cm = s && D.songCmts(job.song).find((x) => x.id === job.cm);
  if (!s || !c || !cm) return;
  const j = parseJSON(await ask(C.buildSongReply(c, s, cm), 400, c)) || {};
  const all = D.songCmts(job.song), target = all.find((x) => x.id === cm.id);
  if (!target) return;
  if (j.like && !(target.likes || []).includes(c.id)) (target.likes ||= []).push(c.id);
  const text = String(j.reply || '').trim();
  if (text) all.push({ id: D.uid(), who: c.id, to: target.id, text, ts: Date.now(), likes: [], dislikes: [] });
  D.setSongCmts(job.song, all);
}

/** 路人回你一句 */
async function passReplyJob(job) {
  const s = D.songById(job.song);
  const cm = s && D.songCmts(job.song).find((x) => x.id === job.cm);
  if (!s || !cm) return;
  const j = parseJSON(await ask(C.buildSongPassReply(s, cm, job.who), 300)) || {};
  const text = String(j.reply || '').trim();
  const all = D.songCmts(job.song), target = all.find((x) => x.id === cm.id);
  if (!target) return;
  if (Math.random() < 0.6 && !(target.likes || []).includes(job.who)) (target.likes ||= []).push(job.who);
  if (text) all.push({ id: D.uid(), who: job.who, to: target.id, text, ts: Date.now(), likes: [], dislikes: [] });
  D.setSongCmts(job.song, all);
}
