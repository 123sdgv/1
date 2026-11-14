// 几个 App 共用的小东西：文字照片、看照片、选角色、转发的聊天记录卡片
import { h, sheet, avatar, inlineEdit, toast, icon } from '../core/ui.js';
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
/** 真图片的小格子（file = 存图的键）。图没了（被清掉了）就是一块灰 */
export function imgTile(file, { cls = '', onclick = null, alt = '' } = {}) {
  const src = D.file(file);
  return h(onclick ? 'button' : 'div', { class: 'ph img ' + cls, onclick, 'aria-label': alt || '图片' },
    src ? h('img', { src, alt: '', draggable: 'false' }) : h('span', { class: 'ph-gone', html: icon('image') }));
}
/** 相册里的一张（文字照片 / 真图片）的小格子 */
export const albumTile = (p, opt = {}) => (p.file ? imgTile(p.file, { ...opt, alt: p.desc }) : photoTile(p.desc, opt));
/** 看照片。p = { desc, file?, ts, who }。edit(新的那句) 给了就是一打开就在那段字上改（下面 × ✓）；真图片的那句可以改成空的 */
export function viewPhoto(p, { edit = null } = {}) {
  const who = p.who && p.who !== 'me' ? D.nameOf(D.charById(p.who)) : '我';
  const txt = h('span', { class: 'ph-txt full', text: p.desc || '' });
  const src = p.file ? D.file(p.file) : null;
  const pic = p.file
    ? h('div', { class: 'ph-real' }, src ? h('img', { src, alt: '', draggable: 'false' }) : h('span', { class: 'ph-gone', html: icon('image') }), h('p', { class: 'ph-cap' }, txt))
    : h('div', { class: 'ph big', style: { background: tone(p.desc) } }, txt);
  const s = sheet({ title: '照片', body: h('div', { class: 'ph-view' }, pic,
    p.ts ? h('p', { class: 'ph-meta', text: `${who} · ${md(p.ts)} ${hm(p.ts)}` }) : null) });
  if (edit) setTimeout(() => inlineEdit(txt, p.desc || '', { save: (v) => { if (!v && !p.file) { toast('不能是空的'); return false; } if (v !== (p.desc || '')) edit(v); }, done: () => s.close() }), 380);
}

/** 书的封面：按书名算一个固定的深灰，书名竖着写。mini = 小图不写字；kids = 叠在封面上的东西（比如一起读的人的头像） */
export function bookCover(title, cls = '', { mini = false, kids = null } = {}) {
  let x = 7;
  for (const ch of String(title)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = 26 + (x % 22), b = 8 + ((x >> 7) % 12), ang = 150 + ((x >> 14) % 60);
  return h('div', { class: 'bk-cv ' + cls, style: { background: `linear-gradient(${ang}deg, hsl(0 0% ${a}%), hsl(0 0% ${b}%))` } },
    mini ? null : h('span', { class: 'bk-cv-t', text: title }), kids);
}

/** 选一个角色（当前账号） */
export function pickChar(title, onPick, filter = () => true) {
  const list = D.chars().filter(filter);
  const body = h('div', { class: 'pick-list' });
  const s = sheet({ title, body });
  if (!list.length) body.append(h('div', { class: 'empty', text: '还没有角色' }));
  for (const c of list) body.append(h('button', { class: 'pick-it', onclick: () => { s.close(); onPick(c); } }, avatar(c.avatar, D.nameOf(c), 'sm'), h('span', { text: D.nameOf(c) })));
}

/** 转发的聊天记录：一张卡片，点开看全部 */
export function fwdCard(f, cls = '') {
  const items = f.items || [];
  return h('button', { class: 'card fwd ' + cls, onclick: (e) => { e.stopPropagation(); viewFwd(f); } },
    h('div', { class: 'fw-top' }, h('b', { text: f.title }),
      h('div', { class: 'fw-lines' }, items.slice(0, 3).map((x) => h('small', { text: `${x.name}：${x.text}` })))),
    h('div', { class: 'cd-foot', text: `聊天记录 · ${items.length} 条` }));
}
export function viewFwd(f) {
  sheet({ title: f.title, full: (f.items || []).length > 8, body: h('div', { class: 'fw-view' },
    (f.items || []).map((x) => h('div', { class: 'fw-it' }, h('b', { text: x.name }), h('p', { text: x.text })))) });
}
