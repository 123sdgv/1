// 社交 App：底部三页 —— 消息、动态、我的。结构参照常见的聊天软件，外观是自己的。
import { h, Stack, avatar, icon, btnIc } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { tick } from '../../core/life.js';
import { listPane } from './list.js';
import { momentsPane } from './moments.js';
import { mePane, switchAccount } from './me.js';
import { openChat } from './chat.js';
import { editChar } from './char.js';

export function mount(body, { close, arg }) {
  const stack = new Stack(body, close);
  const ctx = { stack, close, push: (pg) => stack.push(pg) };

  const head = h('header', { class: 'bar so-bar' });
  const panes = h('div', { class: 'so-panes' });
  const tabs = h('nav', { class: 'so-tabs' });
  const el = h('section', { class: 'pg so-root' }, head, panes, tabs);
  const P = {
    list: { name: '消息', icon: 'msg', make: () => listPane(ctx) },
    moments: { name: '动态', icon: 'star', make: () => momentsPane(ctx) },
    me: { name: '我的', icon: 'user', make: () => mePane(ctx) },
  };
  let tab = 'list', pane = null;
  const offs = [];

  function drawHead() {
    const acc = D.curAccount();
    head.innerHTML = '';
    const me = h('button', { class: 'so-me', 'aria-label': '切换身份', onclick: () => switchAccount(ctx) }, avatar(acc.avatar, acc.name, 'sm'));
    const right = tab === 'list' ? btnIc('plus', () => editChar(ctx, null), '新建角色')
      : tab === 'moments' ? btnIc('edit', () => pane?.compose?.(), '写说说')
      : btnIc('swap', () => switchAccount(ctx), '切换身份');
    head.append(h('div', { class: 'lt' }, me), h('b', { class: 'ttl', text: tab === 'me' ? acc.name || '我的' : P[tab].name }), h('div', { class: 'rt' }, right));
  }
  function drawTabs() {
    tabs.innerHTML = '';
    const unread = D.chars().reduce((s, c) => s + (D.meta(c.id).unread || 0), 0);
    for (const [k, t] of Object.entries(P)) {
      tabs.append(h('button', { class: 'so-tab' + (k === tab ? ' on' : ''), onclick: () => show(k) },
        h('span', { class: 'so-tab-ic', html: icon(t.icon) }, k === 'list' && unread ? h('i', { class: 'badge', text: unread > 99 ? '99+' : unread }) : null),
        h('small', { text: t.name })));
    }
  }
  function show(k) {
    tab = k;
    pane?.destroy?.();
    panes.innerHTML = '';
    pane = P[k].make();
    panes.append(pane.el);
    drawHead();
    drawTabs();
    if (k === 'moments') tick();
  }
  offs.push(D.on('account', () => show(tab)), D.on('meta', drawTabs), D.on('chars', drawTabs));
  stack.root({ el, onShow: () => { drawTabs(); pane?.onShow?.(); } });
  show('list');

  const go = (a) => {
    if (!a) return;
    while (stack.pages.length > 1) { const pg = stack.pages.pop(); pg.el.remove(); pg.shade?.remove(); pg.onDestroy?.(); stack.top.el.style.transform = ''; }
    if (a.tab) show(a.tab);
    if (a.chat) { show('list'); openChat(ctx, a.chat); }
  };
  go(arg);
  return { go, destroy: () => { pane?.destroy?.(); offs.forEach((f) => f()); stack.destroyAll(); } };
}
