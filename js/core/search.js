// 联网搜索：角色在聊天里写 [搜索 关键词]，这里去搜，把结果整理成几段字给他看。
// 支持几家，在 设置 → API 里选一家、填 Key。Tavily 确认能从网页直接调；别的几家能不能（跨域）要在设置里点「测试搜索」试。
import { search as conf } from './data.js';

export const PROVIDERS = [
  ['tavily', 'Tavily'],
  ['bocha', '博查'],
  ['jina', 'Jina'],
  ['exa', 'Exa'],
];
export const providerName = (id) => PROVIDERS.find(([k]) => k === id)?.[1] || '';
export const searchReady = () => { const c = conf(); return !!(c.provider && c.key); };

const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const day = (d) => (d ? String(d).slice(0, 10) : '');

// 每家：怎么发请求、怎么把结果拿出来成 [{ title, date, text }]
const ADAPT = {
  tavily: {
    req: (q, key) => ['https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ query: q, max_results: 5, search_depth: 'basic', include_answer: true, topic: 'general' }) }],
    out: (j) => ({ answer: j.answer || '', items: (j.results || []).map((r) => ({ title: r.title, date: day(r.published_date), text: r.content })) }),
  },
  bocha: {
    req: (q, key) => ['https://api.bochaai.com/v1/web-search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ query: q, summary: true, count: 5, freshness: 'noLimit' }) }],
    out: (j) => {
      const v = (j.data || j).webPages?.value || [];
      return { answer: '', items: v.map((r) => ({ title: r.name, date: day(r.datePublished || r.dateLastCrawled), text: r.summary || r.snippet })) };
    },
  },
  jina: {
    req: (q, key) => ['https://s.jina.ai/?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json', Authorization: 'Bearer ' + key } }],
    out: (j) => ({ answer: '', items: (j.data || []).slice(0, 5).map((r) => ({ title: r.title, date: day(r.date || r.publishedTime), text: r.description || r.content })) }),
  },
  exa: {
    req: (q, key) => ['https://api.exa.ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ query: q, numResults: 5, type: 'auto', contents: { text: { maxCharacters: 600 } } }) }],
    out: (j) => ({ answer: '', items: (j.results || []).map((r) => ({ title: r.title, date: day(r.publishedDate), text: r.text })) }),
  },
};

/** 搜一次。返回 { text（给模型看的几段字）, n（几条）}；出错抛出中文原因 */
export async function webSearch(q, { signal } = {}) {
  const c = conf();
  const a = ADAPT[c.provider];
  if (!a || !c.key) throw new Error('还没设搜索');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  signal?.addEventListener('abort', () => ctrl.abort());
  const [url, opt] = a.req(q, c.key.trim());
  let res;
  try {
    res = await fetch(url, { ...opt, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(ctrl.signal.aborted ? '搜索超时了' : '连不上：可能这家不允许网页直接调用（跨域）');
  } finally { clearTimeout(t); }
  if (!res.ok) {
    const hint = { 401: 'Key 不对', 403: '没有权限', 429: '请求太多或额度用完了' }[res.status] || '';
    throw new Error(`${res.status}${hint ? ' ' + hint : ''}`);
  }
  const { answer, items } = a.out(await res.json().catch(() => ({})));
  const list = items.filter((x) => x.title || x.text);
  const text = [
    answer ? `概括：${cut(answer, 300)}` : '',
    ...list.map((x, i) => `${i + 1}. ${cut(x.title, 60)}${x.date ? `（${x.date}）` : ''}\n${cut(x.text, 300)}`),
  ].filter(Boolean).join('\n\n');
  return { text, n: list.length };
}
