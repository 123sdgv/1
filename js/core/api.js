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
 */
export async function chat(messages, { onDelta, signal, temperature, max_tokens, stream = true } = {}) {
  const cfg = api(), st = settings();
  const url = endpoint(cfg.base);
  if (!url || !cfg.model) throw new ApiError('还没填 API：去 设置 → API 填地址和模型', 'config');
  const body = { model: cfg.model, messages, stream, temperature: temperature ?? st.temperature, max_tokens: max_tokens ?? st.maxTokens };
  let res;
  // 网络偶尔会断一下（刚切回来、信号不好）：没连上就自己再试一次，还不行才报错
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { method: 'POST', headers: headers(cfg.key), body: JSON.stringify(body), signal });
      break;
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) throw e.name === 'AbortError' ? e : new DOMException('aborted', 'AbortError');
      if (attempt >= 1) throw new ApiError('连不上：地址写错了，或者这家不允许网页直接调用（跨域）', 'network');
      await new Promise((r) => setTimeout(r, 800));
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }
  if (!res.ok) throw new ApiError(errText(res.status, await res.text().catch(() => '')), 'http');
  const ct = res.headers.get('content-type') || '';
  if (!stream || !ct.includes('event-stream') || !res.body) {
    const raw = await res.text();
    let text = '';
    try { const j = JSON.parse(raw); text = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? ''; }
    catch { text = sseJoin(raw); }
    onDelta && onDelta(text, text);
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', all = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
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
        if (d) { all += d; onDelta && onDelta(d, all); }
      } catch (e) { if (e instanceof ApiError) throw e; }
    }
  }
  return all;
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
