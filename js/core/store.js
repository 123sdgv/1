// 存档：所有数据都在 IndexedDB 的一个键值表里。
// 启动时整个读进内存，改了以后按键延迟写回；导出就是把整张表倒出来，所以加新数据不用改导出导入。

const NAME = 'xsj', VER = 1;
// 这些键（或以「键.」开头的）是密钥：不跟着导出，导入时保留本机原来的
export const SECRET = ['secret'];

let dbp;
function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function run(mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', mode);
    fn(t.objectStore('kv'));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
async function readAll() {
  const d = await open();
  return new Promise((res, rej) => {
    const out = {};
    const c = d.transaction('kv').objectStore('kv').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
    c.onerror = () => rej(c.error);
  });
}

const D = {};
const dirty = new Set();
let timer = 0;
const isSecret = (k) => SECRET.some((s) => k === s || k.startsWith(s + '.'));

export async function boot() {
  Object.assign(D, await readAll());
  // 请浏览器别在空间紧张时自己清掉这份存档（给不给由浏览器定，不弹窗）
  try { navigator.storage?.persist?.().catch(() => {}); } catch {}
}
export const get = (k, d) => (k in D ? D[k] : d);
export function set(k, v) { D[k] = v; touch(k); return v; }
export function del(k) { delete D[k]; touch(k); }
export const keys = (prefix = '') => Object.keys(D).filter((k) => k.startsWith(prefix));
export function touch(k) {
  dirty.add(k);
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
let fails = 0;
export async function flush() {
  clearTimeout(timer);
  if (!dirty.size) return;
  const ks = [...dirty];
  dirty.clear();
  try {
    await run('readwrite', (s) => { for (const k of ks) { if (k in D) s.put(D[k], k); else s.delete(k); } });
    fails = 0;
  } catch (e) {
    // 没写进去（多半是空间满了）：别悄悄丢，记着这些键，过一会儿再试，并告诉界面
    for (const k of ks) dirty.add(k);
    console.warn('存档没写进去', e);
    if (++fails <= 5) { clearTimeout(timer); timer = setTimeout(flush, 4000 * fails); }
    emit('savefail', e);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', () => flush());

export async function exportAll() {
  await flush();
  const data = {};
  for (const [k, v] of Object.entries(D)) if (!isSecret(k)) data[k] = v;
  return { app: 'xsj', v: 1, at: Date.now(), data };
}
export async function importAll(obj) {
  if (!obj || obj.app !== 'xsj' || typeof obj.data !== 'object') throw new Error('这不是小手机的备份文件');
  const keep = {};
  for (const k of Object.keys(D)) if (isSecret(k)) keep[k] = D[k];
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, obj.data, keep);
  dirty.clear();
  await run('readwrite', (s) => { s.clear(); for (const [k, v] of Object.entries(D)) s.put(v, k); });
}
export async function wipe() {
  for (const k of Object.keys(D)) delete D[k];
  dirty.clear();
  await run('readwrite', (s) => s.clear());
}

// 简单的事件总线
const subs = {};
export function on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); }
export function emit(ev, data) { for (const f of [...(subs[ev] || [])]) { try { f(data); } catch (e) { console.error(e); } } }
