// OpenAI 兼容接口：POST {地址}/chat/completions，能流式就流式
import { api, settings } from './data.js';

export class ApiError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }

/** 地址补全：填 https://xx.com、https://xx.com/v1、或完整的 …/chat/completions 都行 */
export function endpoint(base, path = 'chat/completions') {
  let b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  b = b.replace(/\/(chat\/completions|models)$/, '');
  if (!/\/v\d+[a-z]*$/i.test(b)) b += '/v1';
  return b + '/' + path;
}

function headers(key) {
  const h = { 'Content-Type': 'application/json' };
  if (key) h.Authorization = 'Bearer ' + key.trim();
  return h;
}

function errText(status, body) {
  let m = '';
  try { const j = JSON.parse(body); m = j.error?.message || j.message || j.detail || ''; } catch { m = body.slice(0, 160); }
  const hint = { 401: 'Key 不对或过期了', 403: '没有权限', 404: '地址或模型名不对', 429: '请求太多或额度用完了', 500: '对方服务器出错了', 502: '对方网关出错了', 503: '对方暂时不可用' }[status] || '';
  return `${status}${hint ? ' ' + hint : ''}${m ? '：' + m : ''}`;
}

/**
 * 发一次对话。onDelta(片段, 到目前为止的全文) 每来一点字调一次。返回完整文字。
 * onEnd(原因) 写完时告诉一声为什么停（'length' = 到 token 上限被截断了）。
 * onAlive() 每收到一点东西都调（连思考过程、排队时的 keep-alive 那种不显示的也算）；onAlive(true) = 这家不是一点一点回的，整段写完才来。
 *
 * 超时（不然一个请求挂着，queue() 里后面的全等着，界面上一直转圈）：
 *   timeout  从发出去算，最多等多久（默认 4 分钟）
 *   first    多久还没来第一个正文字就停（默认 = timeout；推理模型先想，想的那段不算正文）
 *   idle     正文开始以后，多久没来新的正文就停（默认 60 秒）。只有正文算「有动静」：keep-alive、思考过程都不算
 * 超时扔 ApiError（kind 'timeout'），写了一半的放在 e.part；别的错误也带 e.part
 */
export const LIMIT = { timeout: 240000, idle: 60000 };
export async function chat(messages, { onDelta, onAlive, onEnd, signal, temperature, max_tokens, stream = true, timeout = LIMIT.timeout, first, idle = LIMIT.idle } = {}) {
  const cfg = api(), st = settings();
  const url = endpoint(cfg.base);
  if (!url || !cfg.model) throw new ApiError('还没填 API：去 设置 → API 填地址和模型', 'config');
  const body = { model: cfg.model, messages, stream, temperature: temperature ?? st.temperature, max_tokens: max_tokens ?? st.maxTokens };
  // 自己的 AbortController：外面停（signal）和超时都走它
  const ctrl = new AbortController();
  const outer = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', outer);
  const t0 = Date.now(), firstMs = first ?? timeout;
  let last = 0, whole = false, over = '', all = '';
  const watch = setInterval(() => {
    const now = Date.now();
    if (now - t0 > timeout) over = 'whole';
    else if (!whole && !last && now - t0 > firstMs) over = 'first';
    else if (!whole && last && now - last > idle) over = 'idle';
    if (over) { clearInterval(watch); ctrl.abort(); }
  }, 500);
  const aborted = () => (signal?.aborted ? new DOMException('aborted', 'AbortError') : null);
  try {
    let res;
    // 网络偶尔会断一下（刚切回来、信号不好）：没连上就自己再试一次，还不行才报错
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(url, { method: 'POST', headers: headers(cfg.key), body: JSON.stringify(body), signal: ctrl.signal });
        break;
      } catch (e) {
        if (ctrl.signal.aborted) throw e;
        if (attempt >= 1) throw new ApiError('连不上：地址写错了，或者这家不允许网页直接调用（跨域）', 'network');
        await new Promise((r) => setTimeout(r, 800));
        if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
      }
    }
    if (!res.ok) throw new ApiError(errText(res.status, await res.text().catch(() => '')), 'http');
    const ct = res.headers.get('content-type') || '';
    if (!stream || !ct.includes('event-stream') || !res.body) {
      whole = true; // 整段写完才回：只看总时长
      onAlive && onAlive(true);
      const raw = await res.text();
      let text = '';
      try { const j = JSON.parse(raw); text = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? ''; onEnd && onEnd(j.choices?.[0]?.finish_reason || ''); }
      catch { text = sseJoin(raw); }
      all = text;
      onDelta && onDelta(text, text);
      return text;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onAlive && onAlive();
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          if (j.error) throw new ApiError(j.error.message || '出错了', 'http');
          const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? '';
          if (d) { all += d; last = Date.now(); onDelta && onDelta(d, all); }
          if (j.choices?.[0]?.finish_reason) onEnd && onEnd(j.choices[0].finish_reason);
        } catch (e) { if (e instanceof ApiError) throw e; }
      }
    }
    return all;
  } catch (e) {
    let err = e;
    if (over) err = new ApiError(over === 'whole' ? '太久没写完，停下了' : over === 'first' ? '等了半天没开始写，停下了' : '写到一半没动静了，停下了', 'timeout');
    else err = aborted() || e;
    try { err.part = all; } catch {}
    throw err;
  } finally {
    clearInterval(watch);
    signal?.removeEventListener('abort', outer);
  }
}

// 有些中转不管 stream 设没设都回 SSE 文本
function sseJoin(raw) {
  let out = '';
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    try { const j = JSON.parse(t.slice(5)); out += j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''; } catch {}
  }
  return out;
}

export async function listModels() {
  const cfg = api();
  const url = endpoint(cfg.base, 'models');
  if (!url) throw new ApiError('先填地址', 'config');
  let res;
  try { res = await fetch(url, { headers: headers(cfg.key) }); }
  catch { throw new ApiError('连不上：地址写错了，或者不允许网页直接调用', 'network'); }
  if (!res.ok) throw new ApiError(errText(res.status, await res.text().catch(() => '')), 'http');
  const j = await res.json();
  return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
}

export async function testApi() {
  const t0 = performance.now();
  const text = await chat([{ role: 'user', content: '回复「好」一个字。' }], { max_tokens: 20, temperature: 0 });
  return { text: text.trim(), ms: Math.round(performance.now() - t0) };
}

// ── 后台任务排队：写日记、回动态这些一件一件来，不抢聊天的道 ──
let chain = Promise.resolve();
export function queue(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}
