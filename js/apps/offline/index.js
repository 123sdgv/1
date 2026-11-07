// 线下：和角色面对面的长文剧情。一个身份下可以有好几段，每段一个角色、一个场景。
import { h, Stack, page, avatar, icon, btnIc, sheet, menu, ask, toast, confirm, longPress, autosize, paras, inputRow, areaRow, group } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as CS from '../../core/chat.js';
import { short } from '../../core/time.js';
import { pickChar } from '../shared.js';

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '线下', big: true, left: h('span'), right: btnIc('plus', () => newStory(), '新的见面') });
  pg.el.classList.add('off');
  const draw = () => {
    const list = D.storiesOf();
    pg.scroll.querySelectorAll('.off-list,.empty,.btn').forEach((x) => x.remove());
    if (!list.length) {
      pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有见过面' }), '在聊天页右上角点门的图标，或者点这里新建一段。'), h('button', { class: 'btn wide', text: '新的见面', onclick: () => newStory() }));
      return;
    }
    const box = h('div', { class: 'off-list' });
    for (const st of list) {
      const c = D.charById(st.char);
      const ms = D.storyMsgs(st.id);
      const last = ms[ms.length - 1];
      const it = h('button', { class: 'off-it', onclick: () => openStory(st.id) },
        avatar(c?.avatar, D.nameOf(c)),
        h('div', {}, h('b', { text: st.title || '见面' }), h('small', { text: `${D.nameOf(c)} · ${ms.length} 段 · ${short(st.lastTs || st.createdAt)}` }),
          h('p', { text: last ? D.partsOf(last)[0]?.text?.slice(0, 60) || '' : st.scene || '' })));
      longPress(it, () => menu([['删除这段', async () => { if (await confirm('删除这段线下剧情？', '', '删除', true)) D.removeStory(st.id); }, 'danger']], st.title));
      box.append(it);
    }
    pg.scroll.append(box);
  };
  const offs = [D.on('stories', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  function newStory(cid) {
    if (!cid) { pickChar('和谁见面', (c) => newStory(c.id)); return; }
    const c = D.charById(cid);
    const data = { title: '', scene: '' };
    const s = sheet({ title: `和 ${D.nameOf(c)} 见面`, body: h('div', {},
      group('', inputRow({ label: '标题', placeholder: '比如：周五晚上', onchange: (v) => { data.title = v.trim(); } })),
      group('场景', areaRow({ placeholder: '在哪、什么时候、为什么见面、气氛……留空就让他自己安排', rows: 5, onchange: (v) => { data.scene = v; } })),
      h('button', { class: 'btn wide', text: '开始', onclick: () => {
        document.activeElement?.blur();
        setTimeout(() => {
          s.close();
          const st = D.saveStory({ id: D.uid(), acc: c.acc, char: c.id, title: data.title || '见面', scene: data.scene.trim(), createdAt: Date.now(), lastTs: Date.now() });
          openStory(st.id, true);
        }, 30);
      } })) });
  }

  function openStory(sid, start = false) {
    const st = D.stories().find((s) => s.id === sid);
    if (!st) return;
    const c = D.charById(st.char);
    const p = page({ title: st.title || '见面', onBack: () => stack.pop(), right: btnIc('more', () => storyMenu(st), '设置') });
    p.el.classList.add('off-story');
    const list = h('div', { class: 'os-list' });
    p.scroll.append(h('div', { class: 'os-scene' }, avatar(c?.avatar, D.nameOf(c), 'sm'), h('p', { text: st.scene || `和 ${D.nameOf(c)} 见面` })), list);
    const ta = h('textarea', { class: 'ch-in', rows: 1, placeholder: '你做什么、说什么…（空着发送就是让他接着写）' });
    const fit = autosize(ta, 140);
    const send = h('button', { class: 'ch-send' });
    p.el.append(h('div', { class: 'ch-foot' }, h('div', { class: 'ch-bar' }, ta, send)));
    const key = 'story:' + sid;
    const drawSend = () => { const b = CS.busy(key), has = !!ta.value.trim(); send.className = 'ch-send' + (b ? ' stop' : has ? ' go' : ''); send.innerHTML = icon(b ? 'stop' : 'send'); };
    ta.addEventListener('input', drawSend);
    send.addEventListener('pointerdown', (e) => e.preventDefault());
    send.onclick = () => {
      if (CS.busy(key)) { CS.stop(key); return; }
      const text = ta.value.trim();
      const ms = D.storyMsgs(sid);
      if (text) { ms.push({ id: D.uid(), role: 'me', ts: Date.now(), alts: [[{ t: 'text', text }]], cur: 0 }); D.setStoryMsgs(sid, ms); ta.value = ''; fit(); }
      CS.offlineReply(sid);
      drawSend();
    };
    const draw = () => {
      const ms = D.storyMsgs(sid);
      const near = p.scroll.scrollHeight - p.scroll.scrollTop - p.scroll.clientHeight < 160;
      list.innerHTML = '';
      ms.forEach((r, i) => {
        const txt = D.partsOf(r)[0]?.text || '';
        const isLast = i === ms.length - 1 && r.role === 'them';
        const el = h('div', { class: 'os-it ' + r.role }, r.role === 'me' ? h('p', { class: 'os-me', text: txt }) : h('div', { class: 'os-text' }, paras(txt)));
        if (r.pending && !txt) el.append(h('span', { class: 'dots3' }, h('i'), h('i'), h('i')));
        if (r.error) el.append(h('button', { class: 'ch-err', text: `没写成：${r.error}　点这里重试`, onclick: () => CS.offlineReply(sid, { regen: !!D.partsOf(r)[0]?.text || r.alts.length > 1 }) }));
        if (isLast && !r.pending && txt) {
          const n = r.alts.length;
          el.append(h('div', { class: 'ch-ctl' },
            n > 1 ? h('button', { html: icon('left'), disabled: r.cur === 0 || null, onclick: () => { r.cur--; D.setStoryMsgs(sid, ms); } }) : null,
            n > 1 ? h('span', { text: `${r.cur + 1} / ${n}` }) : null,
            n > 1 ? h('button', { html: icon('right'), disabled: r.cur === n - 1 || null, onclick: () => { r.cur++; D.setStoryMsgs(sid, ms); } }) : null,
            h('button', { html: icon('redo'), 'aria-label': '重写', onclick: () => CS.offlineReply(sid, { regen: true }) })));
        }
        longPress(el, () => menu([
          ['编辑', async () => { const v = await ask('编辑', txt, '', true); if (v != null && v.trim()) { r.alts[r.cur || 0] = [{ t: 'text', text: v.trim() }]; D.setStoryMsgs(sid, ms); } }],
          ['删除这段', () => { ms.splice(i, 1); D.setStoryMsgs(sid, ms); }, 'danger'],
        ]));
        list.append(el);
      });
      drawSend();
      if (near) requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight }));
    };
    const offs2 = [D.on('story', (id) => id === sid && draw()), D.on('typing', (k) => k === key && draw())];
    stack.push({ el: p.el, onDestroy: () => offs2.forEach((f) => f()) });
    draw();
    requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight }));
    if (start && !D.storyMsgs(sid).length) CS.offlineReply(sid);
  }

  function storyMenu(st) {
    menu([
      ['改标题', async () => { const v = await ask('标题', st.title); if (v?.trim()) { st.title = v.trim(); D.saveStory(st); stack.top.setTitle?.(st.title); toast('改好了'); } }],
      ['改场景', async () => { const v = await ask('场景', st.scene, '', true); if (v != null) { st.scene = v.trim(); D.saveStory(st); toast('改好了，下一段开始按新场景写'); } }],
      ['删除这段', async () => { if (await confirm('删除这段线下剧情？', '', '删除', true)) { D.removeStory(st.id); stack.pop(); } }, 'danger'],
    ], st.title);
  }

  const go = (a) => {
    if (!a) return;
    while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); stack.top.el.style.transform = ''; }
    if (a.story) openStory(a.story);
    else if (a.newFor) newStory(a.newFor);
  };
  go(arg);
  return { go, destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
