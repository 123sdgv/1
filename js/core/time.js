// 时间格式
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hm = (t = Date.now()) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WEEK = '日一二三四五六';
export const weekday = (t = Date.now()) => '星期' + WEEK[new Date(t).getDay()];
export const md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const full = (t) => `${new Date(t).getFullYear()}年${md(t)} ${weekday(t)} ${hm(t)}`;

const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / 86400000);

/** 列表里的短时间：今天 20:31 / 昨天 / 星期二 / 11月3日 / 2025/11/3 */
export function short(t) {
  const diff = daysBetween(t, Date.now());
  if (diff <= 0) return hm(t);
  if (diff === 1) return '昨天';
  if (diff < 7) return weekday(t);
  const d = new Date(t);
  if (d.getFullYear() !== new Date().getFullYear()) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return md(t);
}
/** 聊天里的分隔时间：20:31 / 昨天 20:31 / 11月3日 20:31 */
export function sep(t) {
  const diff = daysBetween(t, Date.now());
  if (diff <= 0) return hm(t);
  if (diff === 1) return '昨天 ' + hm(t);
  if (diff < 7) return weekday(t) + ' ' + hm(t);
  return md(t) + ' ' + hm(t);
}
/** 动态里的时间：刚刚 / 5 分钟前 / 3 小时前 / 昨天 20:31 / 11月3日 */
export function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (daysBetween(t, Date.now()) === 0) return Math.floor(s / 3600) + ' 小时前';
  return sep(t);
}
/** 「过了多久」给提示词用：3 分钟 / 2 小时 / 5 天 */
export function span(ms) {
  const m = ms / 60000;
  if (m < 1) return '不到一分钟';
  if (m < 60) return Math.round(m) + ' 分钟';
  const h = m / 60;
  if (h < 24) return (h < 10 ? Math.round(h * 10) / 10 : Math.round(h)) + ' 小时';
  return Math.round(h / 24) + ' 天';
}
