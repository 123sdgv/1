// 动态：像 QQ 空间的说说。你和角色都能发，能点赞、评论、楼中楼回复。
// 角色的点赞评论不是马上出来：发完以后随机过几分钟，打开着的时候或下次打开时补上（见 core/life.js）
import { h, avatar, icon, sheet, ask, toast, menu, longPress, autosize, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { ago } from '../../core/time.js';
import { scheduleMyPostReacts, scheduleReplyTo, tick } from '../../core/life.js';
import { photoTile, viewPhoto } from '../shared.js';
import { editChar } from './char.js';

const whoOf = (w) => (w === 'me' ? { name: D.curAccount().name || '我', avatar: D.curAccount().avatar } : (() => { const c = D.charById(w); return { name: D.nameOf(c), avatar: c?.avatar, c }; })());

export function momentsPane(ctx) {
  const el = h('div', { class: 'so-pane scroll mo' });
  const draw = () => {
    const a = D.curAccount();
    const top = el.scrollTop;
    el.innerHTML = '';
    el.append(h('div', { class: 'mo-cover', style: a.cover ? { backgroundImage: `url("${a.cover}")` } : null },
      h('div', { class: 'mo-me' }, h('b', { text: a.name || '我' }), avatar(a.avatar, a.name, 'lg sq'))),
      h('p', { class: 'mo-sign', text: a.sign || '' }));
    const list = D.momentsOf();
    if (!list.length) el.append(h('div', { class: 'empty' }, h('b', { text: '还没有动态' }), '点右上角写一条，角色们会来看。角色自己也会时不时发。'));
    for (const m of list) el.append(postEl(m));
    el.scrollTop = top;
  };

  function postEl(m) {
    const w = whoOf(m.who);
    const liked = m.likes.includes('me');
    const card = h('article', { class: 'mo-post' },
      h('button', { class: 'mo-av', onclick: () => w.c && editChar(ctx, w.c.id) }, avatar(w.avatar, w.name)),
      h('div', { class: 'mo-body' },
        h('b', { class: 'mo-name', text: w.name }),
        m.text ? h('p', { class: 'mo-text', text: m.text }) : null,
        m.photos?.length ? h('div', { class: 'mo-photos n' + Math.min(m.photos.length, 3) }, m.photos.map((p) => photoTile(p, { onclick: () => viewPhoto({ desc: p, ts: m.ts, who: m.who }) }))) : null,
        h('div', { class: 'mo-meta' }, h('small', { text: ago(m.ts) }),
          m.jobs?.length ? h('small', { class: 'mo-wait', text: '·' }) : null,
          h('span', { class: 'mo-acts' },
            h('button', { class: liked ? 'on' : '', 'aria-label': '赞', html: icon(liked ? 'heartf' : 'heart'), onclick: () => like(m) }),
            h('button', { 'aria-label': '评论', html: icon('comment'), onclick: () => comment(m, null) }))),
        (m.likes.length || m.comments.length) ? h('div', { class: 'mo-fb' },
          m.likes.length ? h('div', { class: 'mo-likes' }, h('span', { html: icon('heart') }), m.likes.map((x) => whoOf(x).name).join('、')) : null,
          m.comments.map((cm) => {
            const line = h('button', { class: 'mo-cm', onclick: () => cm.who !== 'me' ? comment(m, cm.who) : null },
              h('b', { text: whoOf(cm.who).name }),
              cm.to ? h('span', { text: ' 回复 ' }) : null, cm.to ? h('b', { text: whoOf(cm.to).name }) : null,
              h('span', { text: '：' + cm.text }));
            if (cm.who === 'me') longPress(line, () => menu([['删除这条评论', () => { m.comments = m.comments.filter((x) => x !== cm); D.saveMoment(m); }, 'danger']]));
            return line;
          })) : null));
    longPress(card.querySelector('.mo-body'), () => menu([
      ['评论', () => comment(m, null)],
      m.who === 'me' ? ['删除这条动态', async () => { if (await confirm('删除这条动态？', '', '删除', true)) D.removeMoment(m.id); }, 'danger'] : null,
    ]));
    return card;
  }

  function like(m) {
    const i = m.likes.indexOf('me');
    if (i >= 0) m.likes.splice(i, 1); else m.likes.push('me');
    D.saveMoment(m);
  }
  async function comment(m, to) {
    const v = await ask(to ? `回复 ${whoOf(to).name}` : '评论', '', '说点什么');
    if (!v || !v.trim()) return;
    const cm = { id: D.uid(), who: 'me', to: to || null, text: v.trim(), ts: Date.now() };
    m.comments.push(cm);
    D.saveMoment(m);
    scheduleReplyTo(m, cm);
  }

  function compose() {
    const photos = [];
    const ta = h('textarea', { class: 'mo-ta', placeholder: '这一刻的想法…', rows: 4 });
    autosize(ta, 260);
    const strip = h('div', { class: 'mo-photos n3 edit' });
    const drawStrip = () => {
      strip.innerHTML = '';
      photos.forEach((p, i) => { const t = photoTile(p, { onclick: () => { photos.splice(i, 1); drawStrip(); } }); t.append(h('i', { class: 'ph-x', text: '×' })); strip.append(t); });
      if (photos.length < 9) strip.append(h('button', { class: 'ph add', html: icon('plus'), onclick: addPhoto }));
    };
    const addPhoto = () => menu([
      ['写一张照片', async () => { const v = await ask('配图', '', '描述这张照片的画面', true); if (v?.trim()) { photos.push(v.trim()); drawStrip(); } }],
      D.photosOf().length ? ['从相册选', () => {
        const grid = h('div', { class: 'ph-grid' });
        const s2 = sheet({ title: '从相册选', body: grid, full: true });
        for (const p of D.photosOf()) grid.append(photoTile(p.desc, { onclick: () => { s2.close(); photos.push(p.desc); drawStrip(); } }));
      }] : null,
    ]);
    drawStrip();
    const s = sheet({ title: '写说说', full: true, body: h('div', { class: 'mo-compose' }, ta, strip,
      h('button', { class: 'btn wide', text: '发表', onclick: () => {
        const text = ta.value.trim();
        if (!text && !photos.length) { toast('写点什么'); return; }
        const m = D.saveMoment({ id: D.uid(), acc: D.curAccount().id, who: 'me', text, photos: [...photos], ts: Date.now(), likes: [], comments: [], jobs: [] });
        for (const p of photos) if (!D.photosOf().some((x) => x.desc === p)) D.addPhoto({ desc: p });
        scheduleMyPostReacts(m);
        s.close();
        el.scrollTop = 0;
      } })) });
    setTimeout(() => ta.focus(), 350);
  }

  draw();
  const offs = [D.on('moments', draw), D.on('chars', draw), D.on('account', draw)];
  const iv = setInterval(() => { tick(); draw(); }, 30000);
  return { el, compose, onShow: draw, destroy: () => { offs.forEach((f) => f()); clearInterval(iv); } };
}
