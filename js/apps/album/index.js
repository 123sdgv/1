// 相册：照片都是一段文字描述的画面。角色发来的会自动存进来；你也可以自己「拍」一张。
import { h, Stack, page, btnIc, ask, menu, confirm, longPress, toast } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { md } from '../../core/time.js';
import { photoTile, viewPhoto } from '../shared.js';

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  let who = 'all';
  const pg = page({ title: '相册', big: true, left: h('span'), right: btnIc('plus', async () => {
    const v = await ask('拍一张', '', '', true);
    if (v?.trim()) { D.addPhoto({ desc: v.trim(), who: 'me' }); toast('存好了'); }
  }, '拍一张') });
  pg.el.classList.add('alb');
  const draw = () => {
    pg.scroll.querySelectorAll('.alb-f,.ph-grid,.empty,.alb-day').forEach((x) => x.remove());
    const all = D.photosOf();
    const people = [...new Set(all.map((p) => p.who))];
    if (people.length > 1) pg.scroll.append(h('div', { class: 'alb-f' },
      h('button', { class: 'chip' + (who === 'all' ? ' on' : ''), text: '全部', onclick: () => { who = 'all'; draw(); } }),
      people.map((w) => h('button', { class: 'chip' + (who === w ? ' on' : ''), text: w === 'me' ? '我拍的' : D.nameOf(D.charById(w)) || '已删除', onclick: () => { who = w; draw(); } }))));
    const list = who === 'all' ? all : all.filter((p) => p.who === who);
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有照片' }))); return; }
    let day = '', grid = null;
    for (const p of list) {
      const d = md(p.ts);
      if (d !== day) { day = d; pg.scroll.append(h('div', { class: 'alb-day', text: d })); grid = h('div', { class: 'ph-grid' }); pg.scroll.append(grid); }
      const t = photoTile(p.desc, { onclick: () => viewPhoto(p) });
      longPress(t, () => menu([
        // 编辑画面：打开大图，在那段字上直接改（不弹框）
        ['编辑画面', () => viewPhoto(p, { edit: (v) => { p.desc = v; D.setPhotos(D.photos()); } })],
        ['删除', async () => { if (await confirm('删除这张照片？', '', '删除', true)) D.setPhotos(D.photos().filter((x) => x.id !== p.id)); }, 'danger'],
      ]));
      grid.append(t);
    }
  };
  const offs = [D.on('photos', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();
  return { destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
