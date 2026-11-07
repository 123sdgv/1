// 线下：面对面的长文剧情。两种：
//   和社交里的角色见面（带着他的人设、你的人设、世界观、记忆、最近的聊天）
//   自己写的一段（像酒馆：这段故事自己的角色、世界观、你是谁、开场，跟社交没关系，哪个身份下都看得到）
// 长按一段冒出黑色小条：重新回复 · 编辑 · 删除（没有引用）。编辑就在原地改。
import { h, Stack, page, avatar, icon, btnIc, menu, toast, confirm, longPress, autosize, paras, inputRow, areaRow, group, row, popbar } from '../../core/ui.js';
import * as D from '../../core/data.js';
import * as CS from '../../core/chat.js';
import { short } from '../../core/time.js';
import { genRows } from '../social/char.js';

const whoOf = (st) => {
  if (st.char) { const c = D.charById(st.char); return { name: D.nameOf(c), avatar: c?.avatar }; }
  return { name: st.card?.name || '', avatar: null };
};
const blankCard = () => ({ name: '', persona: '', world: '', meName: '', me: '', gen: D.genOf({}) });

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '线下', big: true, left: h('span'), right: btnIc('plus', () => storyForm(null), '新的一段') });
  pg.el.classList.add('off');
  const draw = () => {
    const list = D.storiesOf();
    pg.scroll.querySelectorAll('.off-list,.empty').forEach((x) => x.remove());
    if (!list.length) { pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有' }))); return; }
    const box = h('div', { class: 'off-list' });
    for (const st of list) {
      const w = whoOf(st);
      const ms = D.storyMsgs(st.id);
      const last = ms[ms.length - 1];
      const it = h('button', { class: 'off-it', onclick: () => openStory(st.id) },
        avatar(w.avatar, w.name),
        h('div', {}, h('b', { text: st.title || '见面' }), h('small', { text: [w.name, `${ms.length} 段`, short(st.lastTs || st.createdAt)].filter(Boolean).join(' · ') }),
          h('p', { text: last ? D.partsOf(last)[0]?.text?.slice(0, 60) || '' : st.scene || '' })));
      longPress(it, () => menu([['删除这段', async () => { if (await confirm('删除这段线下剧情？', '', '删除', true)) D.removeStory(st.id); }, 'danger']], st.title));
      box.append(it);
    }
    pg.scroll.append(box);
  };
  const offs = [D.on('stories', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  // ── 新建 / 设置：和谁（社交里的角色，或者自己写）、标题、场景；自己写的还有角色、世界观、我、模型参数 ──
  function storyForm(sid, presetChar = null) {
    const old = sid ? D.stories().find((s) => s.id === sid) : null;
    const isNew = !old;
    const v = isNew ? { char: presetChar, title: '', scene: '', card: blankCard() } : structuredClone(old);
    if (!v.card) v.card = blankCard();
    v.card.gen = D.genOf(v.card);
    const ok = h('button', { class: 'tbtn', text: isNew ? '开始' : '保存' });
    const p = page({ title: isNew ? '新的一段' : '设置', onBack: () => stack.pop(), right: ok });
    p.el.classList.add('off-form');
    const form = h('div');
    p.scroll.append(form);
    const drawForm = () => {
      form.innerHTML = '';
      const chars = D.chars();
      if (isNew) {
        const pick = (id) => { v.char = id; drawForm(); };
        form.append(h('div', { class: 'os-who' },
          chars.map((c) => h('button', { class: 'os-who-it' + (v.char === c.id ? ' on' : ''), onclick: () => pick(c.id) }, avatar(c.avatar, D.nameOf(c)), h('small', { text: D.nameOf(c) }))),
          h('button', { class: 'os-who-it' + (!v.char ? ' on' : ''), onclick: () => pick(null) }, h('span', { class: 'av os-own', html: icon('edit') }), h('small', { text: '自己写' }))));
      }
      form.append(group('', inputRow({ label: '标题', value: v.title, onchange: (x) => { v.title = x.trim(); } })));
      if (v.char) {
        form.append(group('场景', areaRow({ value: v.scene, rows: 5, onchange: (x) => { v.scene = x; } })));
      } else {
        const cd = v.card;
        form.append(
          group('角色', inputRow({ label: '名字', value: cd.name, onchange: (x) => { cd.name = x.trim(); } }), areaRow({ value: cd.persona, rows: 6, onchange: (x) => { cd.persona = x; } })),
          group('世界观', areaRow({ value: cd.world, rows: 5, onchange: (x) => { cd.world = x; } })),
          group('我', inputRow({ label: '名字', value: cd.meName, onchange: (x) => { cd.meName = x.trim(); } }), areaRow({ value: cd.me, rows: 4, onchange: (x) => { cd.me = x; } })),
          group('开场', areaRow({ value: v.scene, rows: 5, onchange: (x) => { v.scene = x; } })),
          group('模型', ...genRows(cd.gen)));
      }
      if (!isNew) form.append(group('', row({ label: '删除这段', cls: 'danger center', chev: false, onclick: async () => {
        if (!(await confirm('删除这段线下剧情？', '', '删除', true))) return;
        D.removeStory(old.id);
        while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); }
        stack.top.el.style.transform = '';
      } })));
    };
    ok.onclick = () => {
      document.activeElement?.blur();
      setTimeout(() => {
        if (!v.char && !v.card.name) { toast('写一下角色的名字'); return; }
        const c = v.char ? D.charById(v.char) : null;
        const st = D.saveStory({ ...v, acc: c ? c.acc : null, card: c ? undefined : v.card, title: v.title || (c ? '见面' : v.card.name), id: v.id || D.uid(), createdAt: v.createdAt || Date.now(), lastTs: v.lastTs || Date.now() });
        stack.pop();
        if (isNew) setTimeout(() => openStory(st.id, true), 360);
        else { stack.top.setTitle?.(st.title); toast('保存了'); }
      }, 30);
    };
    drawForm();
    stack.push({ el: p.el });
  }

  // ── 一段剧情 ──
  function openStory(sid, start = false) {
    const st = D.stories().find((s) => s.id === sid);
    if (!st) return;
    const w = whoOf(st);
    const p = page({ title: st.title || '见面', onBack: () => stack.pop(), right: btnIc('more', () => storyForm(sid), '设置') });
    p.el.classList.add('off-story');
    const list = h('div', { class: 'os-list' });
    const head = h('div', { class: 'os-scene' });
    const drawHead = () => {
      const s = D.stories().find((x) => x.id === sid) || st;
      head.innerHTML = '';
      head.hidden = !s.scene;
      head.append(avatar(whoOf(s).avatar, whoOf(s).name, 'sm'), h('p', { text: s.scene || '' }));
    };
    drawHead();
    p.scroll.append(head, list);
    const ta = h('textarea', { class: 'ch-in', rows: 1 });
    const fit = autosize(ta, 140);
    const send = h('button', { class: 'ch-send' });
    p.el.append(h('div', { class: 'ch-foot' }, h('div', { class: 'ch-bar' }, ta, send)));
    const key = 'story:' + sid;
    const drawSend = () => { const b = CS.busy(key), has = !!ta.value.trim(); send.className = 'ch-send' + (b ? ' stop' : has ? ' go' : ''); send.innerHTML = icon(b ? 'stop' : 'send'); };
    ta.addEventListener('input', drawSend);
    send.addEventListener('pointerdown', (e) => e.preventDefault());
    // 空着发送 = 让他接着写
    send.onclick = () => {
      if (CS.busy(key)) { CS.stop(key); return; }
      const text = ta.value.trim();
      const ms = D.storyMsgs(sid);
      if (text) { ms.push({ id: D.uid(), role: 'me', ts: Date.now(), alts: [[{ t: 'text', text }]], cur: 0 }); D.setStoryMsgs(sid, ms); ta.value = ''; fit(); }
      CS.offlineReply(sid);
      drawSend();
    };
    let editing = null; // 正在原地改的那段的 id
    const draw = () => {
      const ms = D.storyMsgs(sid);
      const near = p.scroll.scrollHeight - p.scroll.scrollTop - p.scroll.clientHeight < 160;
      list.innerHTML = '';
      ms.forEach((r, i) => {
        const txt = D.partsOf(r)[0]?.text || '';
        const isLast = i === ms.length - 1;
        if (editing === r.id) { list.append(editEl(r, txt)); return; }
        const block = r.role === 'me' ? h('p', { class: 'os-me', text: txt }) : h('div', { class: 'os-text' }, paras(txt));
        const el = h('div', { class: 'os-it ' + r.role }, block);
        if (r.pending && !txt) el.append(h('span', { class: 'dots3' }, h('i'), h('i'), h('i')));
        if (r.error) el.append(h('button', { class: 'ch-err', text: `没写成：${r.error}　点这里重试`, onclick: () => CS.offlineReply(sid, { regen: !!D.partsOf(r)[0]?.text || r.alts.length > 1 }) }));
        if (isLast && r.role === 'them' && !r.pending && txt && r.alts.length > 1) {
          const n = r.alts.length;
          el.append(h('div', { class: 'ch-ctl' },
            h('button', { html: icon('left'), 'aria-label': '上一个', disabled: r.cur === 0 || null, onclick: () => { r.cur--; D.setStoryMsgs(sid, ms); } }),
            h('span', { text: `${r.cur + 1} / ${n}` }),
            h('button', { html: icon('right'), 'aria-label': '下一个', disabled: r.cur === n - 1 || null, onclick: () => { r.cur++; D.setStoryMsgs(sid, ms); } })));
        }
        if (txt) longPress(block, (e) => popbar(block, [
          isLast ? ['redo', () => CS.offlineReply(sid, { regen: r.role === 'them' }), '重新回复'] : null,
          ['edit', () => { editing = r.id; draw(); }, '编辑'],
          ['trash', () => { const all = D.storyMsgs(sid); all.splice(all.indexOf(r), 1); D.setStoryMsgs(sid, all); }, '删除'],
        ], { x: e.clientX, y: e.clientY }));
        list.append(el);
      });
      drawSend();
      if (near && !editing) requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight }));
    };
    function editEl(r, txt) {
      const t = h('textarea', { class: 'os-ed ' + r.role });
      t.value = txt;
      autosize(t);
      const done = (save) => {
        if (save) {
          const v = t.value.trim();
          if (!v) { toast('不能是空的'); return; }
          r.alts[r.cur || 0] = [{ t: 'text', text: v }];
          editing = null;
          D.setStoryMsgs(sid, D.storyMsgs(sid));
        } else { editing = null; draw(); }
      };
      setTimeout(() => t.focus(), 30);
      return h('div', { class: 'os-it os-editing' }, t, h('div', { class: 'os-ed-bar' },
        h('button', { 'aria-label': '不改了', html: icon('close'), onclick: () => done(false) }),
        h('button', { class: 'ok', 'aria-label': '改好了', html: icon('check'), onclick: () => done(true) })));
    }
    const offs2 = [D.on('story', (id) => id === sid && draw()), D.on('typing', (k) => k === key && draw()), D.on('stories', () => { drawHead(); const s = D.stories().find((x) => x.id === sid); if (s) p.setTitle(s.title || '见面'); })];
    stack.push({ el: p.el, setTitle: p.setTitle, onDestroy: () => offs2.forEach((f) => f()) });
    draw();
    requestAnimationFrame(() => p.scroll.scrollTo({ top: p.scroll.scrollHeight }));
    if (start && !D.storyMsgs(sid).length) CS.offlineReply(sid);
  }

  const go = (a) => {
    if (!a) return;
    while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); stack.top.el.style.transform = ''; }
    if (a.story) openStory(a.story);
    else if (a.newFor) storyForm(null, a.newFor);
  };
  go(arg);
  return { go, destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
