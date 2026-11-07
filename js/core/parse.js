// 把模型的回复拆成一个个部件，以及反过来把记录写回成模型看得懂的文字。
// 聊天格式（每行一条消息）：
//   普通文字
//   [图片] 画面描述
//   [语音] 说的话
//   [引用 原话片段] 回复
//   [表情包 名字]
//   [转账 520] 备注
//   [收下转账] [退还转账]                —— 处理你转给他的
//   [日程 2026-11-20] 事情   [日程 每年 11-20] 事情   —— 往日历里记一件事
//   [动态] 内容                          —— 他发一条动态（不出现在聊天里）
//   [邮件 主题] 另起几行写正文，最后 [/邮件]   —— 他给你发一封邮件（不出现在聊天里）
import { stickerByName } from './data.js';

export const stripThink = (s) => String(s || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/^\s*<\/think>/i, '');

// [标签 参数] 后面的话。标签不含空格、数字、冒号；参数是括号里剩下的
const TAG = /^[\[【]\s*([^\]】\s\d:：]+)\s*[:：]?\s*([^\]】]*?)\s*[\]】]\s*(.*)$/;
const money = (s, d) => { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : d; };
const pad = (n) => String(n).padStart(2, '0');
const QUOTE_MAX = 60;

/** 「2026-11-20」「11月20日」「11-20」「明天」→ YYYY-MM-DD；认不出返回 null */
export function parseDate(s) {
  const t = new Date();
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  s = String(s || '').trim();
  const rel = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[s];
  if (rel != null) return ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + rel));
  let m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (m) {
    let d = `${t.getFullYear()}-${pad(m[1])}-${pad(m[2])}`;
    if (d < ymd(t)) d = `${t.getFullYear() + 1}-${pad(m[1])}-${pad(m[2])}`;
    return d;
  }
  return null;
}

const voiceSec = (text) => Math.max(1, Math.min(60, Math.round(String(text).length / 3.6)));
export const makeVoice = (text) => ({ t: 'voice', text, sec: voiceSec(text) });

/** 一行 → 部件（或动作）。返回 null 表示这行不要 */
export function parseLine(line) {
  let s = line.trim();
  if (!s) return null;
  // 去掉模型偶尔带上的「12:30」前缀
  s = s.replace(/^\[?\d{1,2}:\d{2}\]?\s*/, '');
  const m = s.match(TAG);
  if (m) {
    const [, tag, arg, rest] = m.map((x) => (x || '').trim());
    if (/^(图片|照片|图)$/.test(tag)) return rest || arg ? { t: 'photo', desc: rest || arg } : null;
    // 老格式 [语音 语气] 话：语气不要了，只留话
    if (/^(语音|语音条)$/.test(tag)) return rest ? makeVoice(rest) : arg ? makeVoice(arg) : null;
    if (/^(表情包|表情|贴纸)$/.test(tag)) {
      const name = arg || rest;
      if (!name) return null;
      const st = stickerByName(name);
      return { t: 'sticker', name: st ? st.name : name };
    }
    if (/^(引用|回复)$/.test(tag) && arg) {
      const inner = parseLine(rest) || { t: 'text', text: rest };
      if (inner.act || !rest) return { t: 'text', text: s };
      return { ...inner, quote: { who: null, text: arg.slice(0, QUOTE_MAX) } };
    }
    if (/^(转账|红包)$/.test(tag)) return { t: 'pay', amount: money(arg, 52), note: rest, state: 'wait' };
    if (/^(收下转账|收款|接收转账|领取红包|领红包)$/.test(tag)) return { act: 'takePay' };
    if (/^(退还转账|退回转账|退款)$/.test(tag)) return { act: 'backPay' };
    if (/^(日程|记日程|日历|纪念日|提醒)$/.test(tag)) {
      const yearly = tag === '纪念日' || /每年/.test(arg);
      const date = parseDate(arg.replace('每年', ''));
      if (date && rest) return { t: 'event', date, title: rest.slice(0, 40), yearly };
      return { t: 'text', text: s };
    }
    if (/^(动态|发动态|说说)$/.test(tag)) return rest || arg ? { act: 'post', text: rest || arg } : null;
    if (/^(邮件|发邮件|写信|信)$/.test(tag)) return { act: 'mail', subject: arg.slice(0, 60), body: rest };
  }
  if (MAIL_END.test(s)) return null;
  return { t: 'text', text: s };
}

const MAIL_END = /^[\[【]\s*\/\s*(邮件|信)\s*[\]】]$/;
/** 整段回复 → { parts, acts }。邮件可以跨好几行：[邮件 主题] 到 [/邮件] 之间都是正文，不变成气泡 */
export function parseChat(text) {
  const parts = [], acts = [];
  const lines = stripThink(text).split('\n');
  let mail = null;
  lines.forEach((line, i) => {
    if (mail) {
      if (MAIL_END.test(line.trim())) { acts.push(mail); mail = null; }
      else mail.body += (mail.body ? '\n' : '') + line;
      return;
    }
    const p = parseLine(line);
    if (!p) return;
    // 后面有 [/邮件]，或者这行只有标题（正文还在后面），就进入多行模式
    if (p.act === 'mail' && (!p.body || lines.slice(i + 1).some((l) => MAIL_END.test(l.trim())))) { mail = p; return; }
    if (p.act) acts.push(p); else parts.push(p);
  });
  if (mail) acts.push(mail);
  for (const a of acts) if (a.act === 'mail') a.body = a.body.trim();
  return { parts, acts: acts.filter((a) => a.act !== 'mail' || a.body) };
}

const yuan = (n) => (Math.round(n * 100) / 100).toFixed(2);
const PAY_STATE = { wait: '还没收', open: '还没收', taken: '已收下', back: '已退还' };

/** 部件 → 写给模型看的一行 */
export function partText(p) {
  const q = p.quote ? `[引用 ${p.quote.text}] ` : '';
  switch (p.t) {
    case 'text': return q + p.text;
    case 'voice': return q + `[语音] ${p.text}`;
    case 'sticker': return `[表情包 ${p.name}]`;
    case 'photo': return `[图片] ${p.desc}`;
    case 'red':
    case 'pay': return `[转账 ${yuan(p.amount)}] ${p.note || ''}（${PAY_STATE[p.state] || ''}）`.replace('  ', ' ');
    case 'event': return `[日程 ${p.yearly ? '每年 ' + p.date.slice(5) : p.date}] ${p.title}`;
    case 'note': return `（${p.text}）`;
    case 'fwd': return fwdText(p);
    default: return '';
  }
}
/** 转发的聊天记录写成文字（给模型看、写进动态） */
export const fwdText = (f) => [`[聊天记录] ${f.title}`, ...(f.items || []).map((x) => `${x.name}：${x.text}`)].join('\n');

/** 列表预览、通知、引用用的一句话 */
export function partPreview(p) {
  switch (p.t) {
    case 'text': return p.text;
    case 'voice': return '[语音] ' + p.text;
    case 'sticker': return '[表情包] ' + p.name;
    case 'photo': return '[图片]';
    case 'red':
    case 'pay': return '[转账]' + (p.note ? ' ' + p.note : '');
    case 'event': return '[日程] ' + p.title;
    case 'note': return p.text;
    case 'fwd': return '[聊天记录] ' + p.title;
    default: return '';
  }
}
/** 搜索用：一个部件里所有的字 */
export function partSearchText(p) {
  return [p.text, p.desc, p.name, p.note, p.title, ...(p.items || []).map((x) => x.name + '：' + x.text)].filter(Boolean).join(' ');
}
/** 引用里显示的那句（照片带上画面） */
export function quoteText(p, max = QUOTE_MAX) {
  const s = p.t === 'photo' ? '[图片] ' + p.desc : partPreview(p);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** 从模型回复里抠出 JSON：去掉 ```json 包裹，取第一个 { 到最后一个 } */
export function parseJSON(text) {
  const s = stripThink(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const body = s.slice(a, b + 1);
  try { return JSON.parse(body); } catch {}
  // 常见毛病：结尾多逗号、中文引号
  try { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch { return null; }
}

export const fmtYuan = yuan;
