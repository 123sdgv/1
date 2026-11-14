// 相册：普通的相册，文字照片（一段字描述的画面）和真图片（聊天里发的）都在这里。
// 左上角 ☰ → 角色名单，点一个人 = 你们俩之间的照片（他发的、你发给他的）。右上角 ＋ 自己「拍」一张文字照片。
// 在相册里删、改，不影响聊天记录（真图片的文件两边共用，两边都不用了才删，见 data.js 的 gcImages）。
import { h, Stack, page, btnIc, ask, menu, confirm, longPress, toast, sheet, avatar } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { md } from '../../core/time.js';
import { albumTile, viewPhoto } from '../shared.js';

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  D.fixPhotoChars();
  const pg = page({ title: '相册', big: true, left: btnIc('toc', () => people(), '角色'), right: btnIc('plus', async () => {
    const v = await ask('拍一张', '', '', true);
    if (v?.trim()) { D.addPhoto({ desc: v.trim(), who: 'me' }); toast('存好了'); }
  }, '拍一张') });
  pg.el.classList.add('alb');
  const draw = () => fill(pg, () => D.photosOf());
  const offs = [D.on('photos', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  // ☰：角色名单
  function people() {
    const list = D.chars();
    const box = h('div', { class: 'pick-list' });
    const s = sheet({ title: '', body: box });
    if (!list.length) box.append(h('div', { class: 'empty', text: '还没有角色' }));
    for (const c of list) {
      const n = between(c.id).length;
      box.append(h('button', { class: 'pick-it', onclick: () => { s.close(); openChar(c.id); } },
        avatar(c.avatar, D.nameOf(c)), h('div', {}, h('b', { text: D.nameOf(c) }), h('small', { text: n ? `${n} 张` : '' }))));
    }
  }
  // 你们俩之间的：他拍的（聊天、动态里发的），你在跟他的聊天里发的
  const between = (cid) => D.photosOf().filter((p) => p.who === cid || p.char === cid);
  function openChar(cid) {
    const p = page({ title: D.nameOf(D.charById(cid)), onBack: () => stack.pop() });
    p.el.classList.add('alb');
    const redraw = () => fill(p, () => between(cid));
    const offs2 = [D.on('photos', redraw)];
    stack.push({ el: p.el, onDestroy: () => offs2.forEach((f) => f()) });
    redraw();
  }

  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}

/** 一页照片：按天分组，三列格子。长按 = 编辑画面（改那句）· 删除 */
function fill(pg, get) {
  pg.scroll.querySelectorAll('.ph-grid,.empty,.alb-day').forEach((x) => x.remove());
  const list = get();
  if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有照片' }))); return; }
  let day = '', grid = null;
  for (const p of list) {
    const d = md(p.ts);
    if (d !== day) { day = d; pg.scroll.append(h('div', { class: 'alb-day', text: d })); grid = h('div', { class: 'ph-grid' }); pg.scroll.append(grid); }
    const t = albumTile(p, { onclick: () => viewPhoto(p) });
    longPress(t, () => menu([
      // 编辑画面：打开大图，在那段字上直接改（不弹框）
      ['编辑画面', () => viewPhoto(p, { edit: (v) => { const all = D.photos(); const x = all.find((y) => y.id === p.id); if (x) { x.desc = v; D.setPhotos(all); } } })],
      ['删除', async () => { if (await confirm('删除这张照片？', '', '删除', true)) D.setPhotos(D.photos().filter((x) => x.id !== p.id)); }, 'danger'],
    ]));
    grid.append(t);
  }
}
