// 邮箱：用的是当前身份在「社交 → 我的」里设的邮箱（一个身份一个）。收件箱、已发送、草稿、回收站。
// 删除都先进回收站；回收站里再删才是真删。往左滑露出删除。
// 发给角色的信他会读、过一会儿回（core/mail.js）；他的地址他自己起，你得问他或者等他告诉你。
import { h, Stack, page, btnIc, icon, avatar, group, row, toast, confirm, menu, swipeRow, autosize, paras } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { sendMail } from '../../core/mail.js';
import { short, full } from '../../core/time.js';
import { openApp } from '../../phone/window.js';

const BOXES = [
  { id: 'inbox', name: '收件箱', icon: 'inbox' },
  { id: 'sent', name: '已发送', icon: 'send' },
  { id: 'draft', name: '草稿', icon: 'edit' },
  { id: 'trash', name: '回收站', icon: 'trash' },
];
const boxName = (id) => BOXES.find((b) => b.id === id)?.name || '';
// 地址显示成人：你自己、认识的角色（用你给他的备注），不认识的就是地址
function person(addr, fallbackName = '') {
  const w = D.whoseAddr(addr);
  if (w?.me) return { name: D.curAccount().name || '我', avatar: D.curAccount().avatar };
  if (w?.c) return { name: D.nameOf(w.c), avatar: w.c.avatar };
  return { name: fallbackName || addr || '（没有收件人）', avatar: null };
}
const fromBox = (m) => (m.box === 'trash' ? m.was : m.box);

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '邮箱', big: true, left: h('span'), right: btnIc('compose', () => compose(), '写信') });
  pg.el.classList.add('ml');
  const draw = () => {
    pg.scroll.querySelectorAll(':scope > :not(.bigttl)').forEach((x) => x.remove());
    const addr = D.myAddr();
    if (!addr) {
      pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没有邮箱' })), h('button', { class: 'btn wide', text: '去设置', onclick: () => openApp('social', { tab: 'me' }) }));
      return;
    }
    pg.scroll.append(h('p', { class: 'ml-addr', text: addr }),
      group('', ...BOXES.map((b) => {
        const n = b.id === 'inbox' ? D.unreadMails() : b.id === 'draft' ? D.mailsOf('draft').length : 0;
        return row({ label: b.name, icon: b.icon, value: n ? String(n) : '', onclick: () => openBox(b.id) });
      })));
  };
  const offs = [D.on('mails', draw), D.on('account', draw)];
  stack.root({ el: pg.el, onShow: draw });
  draw();

  // ── 一个文件夹 ──
  function openBox(box) {
    const p = page({ title: boxName(box), onBack: () => stack.pop(), right: box === 'trash' ? null : btnIc('compose', () => compose(), '写信') });
    p.el.classList.add('ml');
    const drawList = () => {
      p.scroll.innerHTML = '';
      const list = D.mailsOf(box);
      if (!list.length) { p.scroll.append(h('div', { class: 'empty', text: '没有邮件' })); return; }
      const wrap = h('div', { class: 'ml-list' });
      for (const m of list) {
        const src = fromBox(m);
        const who = src === 'inbox' ? person(m.from, m.fromName) : person(m.to);
        const it = h('button', { class: 'ml-it' + (src === 'inbox' && !m.read ? ' unread' : ''), onclick: () => (m.box === 'draft' ? compose(m) : openMail(m.id)) },
          h('i', { class: 'ml-dot' }),
          h('div', { class: 'ml-mid' },
            h('div', { class: 'ml-top' }, h('b', { text: (src === 'inbox' ? '' : src === 'draft' ? '草稿 · ' : '发给 ') + who.name }), h('small', { text: short(m.ts) })),
            h('div', { class: 'ml-subj', text: m.subject || '（无主题）' }),
            h('div', { class: 'ml-pre', text: (m.body || '').replace(/\s+/g, ' ').slice(0, 90) })));
        wrap.append(swipeRow(it, () => trash(m)));
      }
      p.scroll.append(wrap);
    };
    const off = D.on('mails', drawList);
    stack.push({ el: p.el, onShow: drawList, onDestroy: off });
    drawList();
  }

  // 删除：不在回收站的进回收站；在回收站的真删
  function trash(m) {
    if (m.box === 'trash') { D.removeMail(m.id); return; }
    D.saveMail({ ...m, was: m.box, box: 'trash', read: true });
  }

  // ── 看一封 ──
  function openMail(id) {
    const m = D.mails().find((x) => x.id === id);
    if (!m) return;
    if (!m.read) D.saveMail({ ...m, read: true });
    const src = fromBox(m);
    const right = m.box === 'trash'
      ? [btnIc('undo', () => { D.saveMail({ ...m, box: m.was || 'inbox', was: undefined }); toast('放回' + boxName(m.was || 'inbox')); stack.pop(); }, '放回去'),
        btnIc('trash', async () => { if (await confirm('彻底删除这封信？', '', '删除', true)) { D.removeMail(m.id); stack.pop(); } }, '彻底删除')]
      : [src === 'inbox' ? btnIc('reply', () => compose(null, m), '回复') : null,
        btnIc('trash', () => { trash(m); stack.pop(); }, '删除')];
    const p = page({ title: '', onBack: () => stack.pop(), right });
    p.el.classList.add('ml', 'ml-read');
    const from = person(m.from, m.fromName), to = person(m.to);
    p.scroll.append(h('article', { class: 'ml-art' },
      h('h2', { text: m.subject || '（无主题）' }),
      h('div', { class: 'ml-hd' }, avatar(from.avatar, from.name),
        h('div', {}, h('b', { text: from.name }), h('small', { text: m.from }), h('small', { text: `发给 ${to.name}${to.name !== m.to ? ' <' + m.to + '>' : ''}` })),
        h('time', { text: full(m.ts) })),
      h('div', { class: 'ml-body' }, paras(m.body))));
    stack.push({ el: p.el });
  }

  // ── 写信（也用来接着写草稿、回信）──
  function compose(draft = null, re = null) {
    const addr = D.myAddr();
    if (!addr) { toast('先在「社交 → 我的」里设一个邮箱'); return; }
    const v = draft ? { to: draft.to, subject: draft.subject, body: draft.body }
      : re ? { to: re.from, subject: /^re[:：]/i.test(re.subject || '') ? re.subject : 'Re: ' + (re.subject || ''), body: '' }
      : { to: '', subject: '', body: '' };
    const start = JSON.stringify(v);
    const toIn = h('input', { class: 'mc-in', type: 'email', inputmode: 'email', value: v.to, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const subIn = h('input', { class: 'mc-in', type: 'text', value: v.subject });
    const ta = h('textarea', { class: 'mc-body' });
    ta.value = v.body;
    autosize(ta);
    const read = () => { v.to = toIn.value.trim(); v.subject = subIn.value.trim(); v.body = ta.value; };
    const leave = () => {
      read();
      const empty = !v.to && !v.subject && !v.body.trim();
      if (empty && !draft) { stack.pop(); return; }
      if (JSON.stringify(v) === start && draft) { stack.pop(); return; }
      menu([
        ['存草稿', () => { D.saveMail({ ...(draft || { id: D.uid(), acc: D.curAccount().id, from: addr, fromName: D.curAccount().name || '我', read: true }), box: 'draft', to: v.to, subject: v.subject, body: v.body, ts: Date.now() }); stack.pop(); }],
        ['不保存', () => { if (draft) D.saveMail({ ...draft, was: 'draft', box: 'trash' }); stack.pop(); }, 'danger'],
      ]);
    };
    const sendBtn = h('button', { class: 'mc-send', 'aria-label': '发送', html: icon('send'), onclick: () => {
      read();
      if (!v.to) { toast('写一下收件人'); toIn.focus(); return; }
      if (!v.body.trim() && !v.subject) { toast('写点什么'); return; }
      document.activeElement?.blur();
      sendMail({ to: v.to, subject: v.subject, body: v.body.trim(), draftId: draft?.id });
      toast('发出去了');
      stack.pop();
    } });
    const p = page({ title: '新邮件', left: h('button', { class: 'bk', 'aria-label': '关闭', html: icon('close'), onclick: leave }), right: sendBtn });
    p.el.classList.add('ml', 'ml-compose');
    p.scroll.append(
      h('div', { class: 'mc-rows' },
        h('div', { class: 'mc-row' }, h('span', { text: '发件人' }), h('em', { text: addr })),
        h('label', { class: 'mc-row' }, h('span', { text: '收件人' }), toIn),
        h('label', { class: 'mc-row' }, h('span', { text: '主题' }), subIn)),
      ta);
    stack.push({ el: p.el });
    setTimeout(() => (v.to ? ta : toIn).focus(), 360);
  }

  const go = (a) => {
    if (!a?.mail) return;
    while (stack.pages.length > 1) { const x = stack.pages.pop(); x.el.remove(); x.shade?.remove(); x.onDestroy?.(); stack.top.el.style.transform = ''; }
    const m = D.mails().find((x) => x.id === a.mail);
    if (m) openMail(m.id);
  };
  go(arg);
  return { go, destroy: () => { offs.forEach((f) => f()); stack.destroyAll(); } };
}
