// 把模型的回复拆成一个个部件，以及反过来把记录写回成模型看得懂的文字。
// 聊天格式（每行一条消息）：
//   普通文字
//   [图片] 画面描述
//   [红包 52] 祝福语        [转账 520] 备注
//   [领取红包] [收下转账] [退还转账]   —— 处理你发给他的
//   [动态] 内容                        —— 他发一条动态（不出现在聊天里）

export const stripThink = (s) => String(s || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/^\s*<\/think>/i, '');

const TAG = /^[\[【]\s*([^\]】\s]+)\s*([0-9]+(?:\.[0-9]{1,2})?)?\s*[\]】]\s*(.*)$/;
const money = (s, d) => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : d; };

/** 一行 → 部件（或动作）。返回 null 表示这行不要 */
export function parseLine(line) {
  let s = line.trim();
  if (!s) return null;
  // 去掉模型偶尔带上的「名字：」「12:30」前缀
  s = s.replace(/^\[?\d{1,2}:\d{2}\]?\s*/, '');
  const m = s.match(TAG);
  if (m) {
    const [, tag, num, rest] = m;
    if (/^(图片|照片|图)$/.test(tag)) return rest ? { t: 'photo', desc: rest.trim() } : null;
    if (tag === '红包') return { t: 'red', amount: money(num, 8.88), note: rest.trim() || '恭喜发财', state: 'open' };
    if (tag === '转账') return { t: 'pay', amount: money(num, 52), note: rest.trim(), state: 'wait' };
    if (/^(领取红包|领红包|收红包)$/.test(tag)) return { act: 'takeRed' };
    if (/^(收下转账|收款|接收转账)$/.test(tag)) return { act: 'takePay' };
    if (/^(退还转账|退回转账|退款)$/.test(tag)) return { act: 'backPay' };
    if (/^(动态|发动态|说说)$/.test(tag)) return rest.trim() ? { act: 'post', text: rest.trim() } : null;
  }
  return { t: 'text', text: s };
}

/** 整段回复 → { parts, acts } */
export function parseChat(text) {
  const parts = [], acts = [];
  for (const line of stripThink(text).split('\n')) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.act) acts.push(p); else parts.push(p);
  }
  return { parts, acts };
}

const yuan = (n) => (Math.round(n * 100) / 100).toFixed(2);
const RED_STATE = { open: '还没领', taken: '已领取', back: '已过期' };
const PAY_STATE = { wait: '还没收', taken: '已收下', back: '已退还' };

/** 部件 → 写给模型看的一行 */
export function partText(p) {
  switch (p.t) {
    case 'text': return p.text;
    case 'photo': return `[图片] ${p.desc}`;
    case 'red': return `[红包 ${yuan(p.amount)}] ${p.note}（${RED_STATE[p.state] || ''}）`;
    case 'pay': return `[转账 ${yuan(p.amount)}] ${p.note || ''}（${PAY_STATE[p.state] || ''}）`.replace('  ', ' ');
    case 'note': return `（${p.text}）`;
    default: return '';
  }
}

/** 列表预览用的一句话 */
export function partPreview(p) {
  switch (p.t) {
    case 'text': return p.text;
    case 'photo': return '[图片]';
    case 'red': return '[红包] ' + (p.note || '');
    case 'pay': return '[转账]';
    case 'note': return p.text;
    default: return '';
  }
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
