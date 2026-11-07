// 几个 App 共用的小东西：文字照片、看照片、选角色
import { h, sheet, avatar } from '../core/ui.js';
import * as D from '../core/data.js';
import { md, hm } from '../core/time.js';

// 照片没有真的图，画面是一段文字。底色按描述算一个固定的灰，看起来每张不一样
function tone(s) {
  let x = 0;
  for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = 30 + (x % 40), b = 12 + ((x >> 8) % 20), ang = 120 + ((x >> 16) % 120);
  return `linear-gradient(${ang}deg, hsl(0 0% ${a + 18}%), hsl(0 0% ${b}%))`;
}
export function photoTile(desc, { cls = '', onclick = null, full = false } = {}) {
  return h(onclick ? 'button' : 'div', { class: 'ph ' + cls, style: { background: tone(desc) }, onclick },
    h('span', { class: 'ph-txt' + (full ? ' full' : ''), text: desc }));
}
export function viewPhoto(p) {
  const who = p.who && p.who !== 'me' ? D.nameOf(D.charById(p.who)) : '我';
  sheet({ title: '照片', body: h('div', { class: 'ph-view' },
    h('div', { class: 'ph big', style: { background: tone(p.desc) } }, h('span', { class: 'ph-txt full', text: p.desc })),
    p.ts ? h('p', { class: 'ph-meta', text: `${who} · ${md(p.ts)} ${hm(p.ts)}` }) : null) });
}

/** 选一个角色（当前账号） */
export function pickChar(title, onPick, filter = () => true) {
  const list = D.chars().filter(filter);
  const body = h('div', { class: 'pick-list' });
  const s = sheet({ title, body });
  if (!list.length) body.append(h('div', { class: 'empty', text: '这个身份下还没有角色。去「社交 → 我的」里新建一个。' }));
  for (const c of list) body.append(h('button', { class: 'pick-it', onclick: () => { s.close(); onPick(c); } }, avatar(c.avatar, D.nameOf(c), 'sm'), h('span', { text: D.nameOf(c) })));
}
