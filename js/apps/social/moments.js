// 动态：像 QQ 空间的说说。你和角色都能发，能点赞、评论、楼中楼回复。
// 评论不弹窗：点评论，帖子下面直接出一条横线输入框，能写长的，也能带图（图也是文字写的画面）。
// 角色的点赞评论不是马上出来：发完以后随机过几分钟，打开着的时候或下次打开时补上（见 core/life.js）
import { h, avatar, icon, sheet, ask, toast, menu, longPress, autosize, confirm } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { ago } from '../../core/time.js';
import { scheduleMyPostReacts, scheduleReplyTo, tick } from '../../core/life.js';
import { photoTile, viewPhoto, fwdCard } from '../shared.js';
import { editChar } from './char.js';

const whoOf = (w) => (w === 'me' ? { name: D.curAccount().name || '我', avatar: D.curAccount().avatar } : (() => { const c = D.charById(w); return { name: D.nameOf(c), avatar: c?.avatar, c }; })());

/** 从相册挑一张（回调拿到画面描述） */
function pickFromAlbum(onPick) {
  const grid = h('div', { class: 'ph-grid' });
  const s = sheet({ title: '相册', body: grid, full: true });
  if (!D.photosOf().length) grid.append(h('div', { class: 'empty', text: '相册是空的' }));
  for (const p of D.photosOf()) grid.append(photoTile(p.desc, { onclick: () => { s.close(); onPick(p.desc); } }));
}

export function momentsPane(ctx) {
  const el = h('div', { class: 'so-pane scroll mo' });
  // 正在写的评论：{ mid, to, text, photos:[{ desc, live（自己现写的）}] }。写着的时候整页不重画，免得打断
  let cmt = null, pending = false;
  const draw = (force) => {
    if (cmt && !force) { pending = true; return; }
    pending = false;
    const a = D.curAccount();
    const top = el.scrollTop;
    el.innerHTML = '';
    el.append(h('div', { class: 'mo-cover', style: a.cover ? { backgroundImage: `url("${a.cover}")` } : null },
      h('div', { class: 'mo-me' }, h('b', { text: a.name || '我' }), avatar(a.avatar, a.name, 'lg sq'))),
      h('p', { class: 'mo-sign', text: a.sign || '' }));
    const list = D.momentsOf();
    if (!list.length) el.append(h('div', { class: 'empty' }, h('b', { text: '还没有动态' })));
    for (const m of list) el.append(postEl(m));
    el.scrollTop = top;
  };

  function postEl(m) {
    const w = whoOf(m.who);
    const liked = m.likes.includes('me');
    const body = h('div', { class: 'mo-body' },
      h('b', { class: 'mo-name', text: w.name }),
      m.text ? h('p', { class: 'mo-text', text: m.text }) : null,
      m.photos?.length ? h('div', { class: 'mo-photos n' + Math.min(m.photos.length, 3) }, m.photos.map((p) => photoTile(p, { onclick: () => viewPhoto({ desc: p, ts: m.ts, who: m.who }) }))) : null,
      m.fwd ? fwdCard(m.fwd, 'mo-fwd') : null,
      h('div', { class: 'mo-meta' }, h('small', { text: ago(m.ts) }),
        m.jobs?.length ? h('small', { class: 'mo-wait', text: '·' }) : null,
        h('span', { class: 'mo-acts' },
          h('button', { class: liked ? 'on' : '', 'aria-label': '赞', html: icon(liked ? 'heartf' : 'heart'), onclick: () => like(m) }),
          h('button', { 'aria-label': '评论', html: icon('comment'), onclick: () => openCmt(m, null) }))),
      (m.likes.length || m.comments.length) ? h('div', { class: 'mo-fb' },
        m.likes.length ? h('div', { class: 'mo-likes' }, h('span', { html: icon('heart') }), m.likes.map((x) => whoOf(x).name).join('、')) : null,
        m.comments.map((cm) => {
          const line = h('div', { class: 'mo-cm' },
            h('button', { class: 'mo-cm-t', onclick: () => cm.who !== 'me' ? openCmt(m, cm.who) : null },
              h('b', { text: whoOf(cm.who).name }),
              cm.to ? h('span', { text: ' 回复 ' }) : null, cm.to ? h('b', { text: whoOf(cm.to).name }) : null,
              h('span', { text: '：' + cm.text })),
            cm.photos?.length ? h('div', { class: 'mo-cm-ph' }, cm.photos.map((p) => photoTile(p, { onclick: () => viewPhoto({ desc: p, ts: cm.ts, who: cm.who }) }))) : null);
          if (cm.who === 'me') longPress(line, () => menu([['删除这条评论', () => { m.comments = m.comments.filter((x) => x !== cm); D.saveMoment(m); draw(true); }, 'danger']]));
          return line;
        })) : null,
      cmt?.mid === m.id ? cmtEl(m) : null);
    const card = h('article', { class: 'mo-post', 'data-id': m.id },
      h('button', { class: 'mo-av', onclick: () => w.c && editChar(ctx, w.c.id) }, avatar(w.avatar, w.name)), body);
    if (m.who === 'me') {
      const del = () => menu([['删除这条动态', async () => { if (await confirm('删除这条动态？', '', '删除', true)) { if (cmt?.mid === m.id) cmt = null; D.removeMoment(m.id); draw(true); } }, 'danger']]);
      for (const x of body.querySelectorAll(':scope > .mo-name, :scope > .mo-text')) longPress(x, del);
    }
    return card;
  }
  // 只重画一条（写评论时别的帖子点赞用）
  function redrawPost(m) {
    const old = el.querySelector(`.mo-post[data-id="${m.id}"]`);
    if (old) old.replaceWith(postEl(m));
  }

  function like(m) {
    const i = m.likes.indexOf('me');
    if (i >= 0) m.likes.splice(i, 1); else m.likes.push('me');
    D.saveMoment(m);
    if (cmt && cmt.mid !== m.id) redrawPost(m);
  }

  // ── 评论：帖子下面的横线输入框 ──
  function openCmt(m, to) {
    if (cmt && cmt.mid === m.id && cmt.to === to) { closeCmt(); return; }
    const prev = cmt && D.moments().find((x) => x.id === cmt.mid);
    cmt = { mid: m.id, to, text: '', photos: [] };
    if (prev && prev.id !== m.id) redrawPost(prev);
    redrawPost(m);
    requestAnimationFrame(() => el.querySelector('.mo-cmt-in')?.focus());
  }
  function closeCmt() { cmt = null; draw(true); }
  function cmtEl(m) {
    const ta = h('textarea', { class: 'mo-cmt-in', rows: 1 });
    ta.value = cmt.text;
    ta.addEventListener('input', () => { cmt.text = ta.value; });
    autosize(ta, 220);
    const strip = h('div', { class: 'mo-cmt-ph' });
    const drawStrip = () => {
      strip.innerHTML = '';
      strip.hidden = !cmt.photos.length;
      cmt.photos.forEach((p, i) => {
        const x = h('button', { class: 'ph-x', 'aria-label': '去掉', html: icon('close'), onclick: (e) => { e.stopPropagation(); cmt.photos.splice(i, 1); drawStrip(); } });
        if (p.live) {
          const t = h('textarea', { class: 'ph-ed', rows: 4 });
          t.value = p.desc;
          t.addEventListener('input', () => { p.desc = t.value; });
          strip.append(h('div', { class: 'ph ph-live' }, t, x));
        } else {
          const tile = photoTile(p.desc);
          tile.append(x);
          strip.append(tile);
        }
      });
    };
    drawStrip();
    const send = h('button', { class: 'mo-cmt-send', 'aria-label': '发送', html: icon('send'), onclick: () => {
      const text = cmt.text.trim(), photos = cmt.photos.map((p) => p.desc.trim()).filter(Boolean);
      if (!text && !photos.length) return;
      const fresh = D.moments().find((x) => x.id === m.id);
      if (!fresh) { closeCmt(); return; }
      const c = { id: D.uid(), who: 'me', to: cmt.to || null, text, photos, ts: Date.now() };
      fresh.comments.push(c);
      for (const p of photos) if (!D.photosOf().some((x) => x.desc === p)) D.addPhoto({ desc: p });
      cmt = null;
      D.saveMoment(fresh);
      scheduleReplyTo(fresh, c);
      draw(true);
    } });
    // 键盘弹起后把整个评论框（含下面的按钮）滚到看得见：键盘升起、可视高度变了也再滚一次
    const show = () => { if (box.isConnected && box.contains(document.activeElement)) box.scrollIntoView({ block: 'end' }); };
    const onVV = () => setTimeout(show, 30);
    ta.addEventListener('focus', () => { setTimeout(show, 380); visualViewport?.addEventListener('resize', onVV); });
    ta.addEventListener('blur', () => visualViewport?.removeEventListener('resize', onVV));
    const box = h('div', { class: 'mo-cmt' },
      cmt.to ? h('small', { class: 'mo-cmt-to', text: '回复 ' + whoOf(cmt.to).name }) : null,
      ta, strip,
      h('div', { class: 'mo-cmt-bar' },
        h('button', { 'aria-label': '从相册选', html: icon('photo'), onclick: () => pickFromAlbum((d) => { cmt.photos.push({ desc: d }); drawStrip(); }) }),
        h('button', { 'aria-label': '写一张', html: icon('camera'), onclick: () => { cmt.photos.push({ desc: '', live: true }); drawStrip(); requestAnimationFrame(() => strip.querySelector('.ph-live:last-of-type textarea')?.focus()); } }),
        h('span', { class: 'sp' }), send));
    return box;
  }

  draw(true);
  const offs = [D.on('moments', () => draw()), D.on('chars', () => draw()), D.on('account', () => { cmt = null; draw(true); })];
  const iv = setInterval(() => { tick(); draw(); }, 30000);
  return { el, compose: () => composeMoment({ onPosted: () => { el.scrollTop = 0; } }), onShow: () => draw(), destroy: () => { offs.forEach((f) => f()); clearInterval(iv); } };
}

/** 写说说（也用来把聊天记录转发到动态） */
export function composeMoment({ fwd = null, onPosted = null } = {}) {
  const photos = [];
  let card = fwd;
  const ta = h('textarea', { class: 'mo-ta', rows: 4 });
  autosize(ta, 260);
  const strip = h('div', { class: 'mo-photos n3 edit' });
  const fwdBox = h('div', { class: 'mo-fwd-box' });
  const drawFwd = () => { fwdBox.innerHTML = ''; if (card) { const x = fwdCard(card, 'mo-fwd'); fwdBox.append(x, h('button', { class: 'ph-x', 'aria-label': '去掉', html: icon('close'), onclick: () => { card = null; drawFwd(); } })); } };
  const drawStrip = () => {
    strip.innerHTML = '';
    photos.forEach((p, i) => { const t = photoTile(p, { onclick: () => { photos.splice(i, 1); drawStrip(); } }); t.append(h('i', { class: 'ph-x', html: icon('close') })); strip.append(t); });
    if (photos.length < 9) strip.append(h('button', { class: 'ph add', html: icon('plus'), onclick: addPhoto }));
  };
  const addPhoto = () => menu([
    ['写一张照片', async () => { const v = await ask('配图', '', '', true); if (v?.trim()) { photos.push(v.trim()); drawStrip(); } }],
    D.photosOf().length ? ['从相册选', () => pickFromAlbum((d) => { photos.push(d); drawStrip(); })] : null,
  ]);
  drawStrip();
  drawFwd();
  const s = sheet({ title: card ? '转发到动态' : '写说说', full: true, body: h('div', { class: 'mo-compose' }, ta, fwdBox, strip,
    h('button', { class: 'btn wide', text: '发表', onclick: () => {
      const text = ta.value.trim();
      if (!text && !photos.length && !card) { toast('写点什么'); return; }
      const m = D.saveMoment({ id: D.uid(), acc: D.curAccount().id, who: 'me', text, photos: [...photos], fwd: card || undefined, ts: Date.now(), likes: [], comments: [], jobs: [] });
      for (const p of photos) if (!D.photosOf().some((x) => x.desc === p)) D.addPhoto({ desc: p });
      scheduleMyPostReacts(m);
      s.close();
      if (fwd) toast('发出去了');
      onPosted?.();
    } })) });
  setTimeout(() => ta.focus(), 350);
}
