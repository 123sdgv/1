// 我的：当前身份的资料、人设、世界观、动态封面、聊天气泡；切换 / 新建身份；角色列表
import { h, page, avatar, group, row, inputRow, areaRow, note, pickImage, toast, confirm, sheet, icon } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { editChar } from './char.js';

export const BUBBLES = [
  ['ink', '墨', '我黑你白'],
  ['line', '线', '只有细边'],
  ['gray', '灰', '浅灰底'],
  ['paper', '纸', '宋体，像写信'],
];

export function mePane(ctx) {
  const el = h('div', { class: 'so-pane scroll' });
  const draw = () => {
    const a = D.curAccount();
    el.innerHTML = '';
    el.append(
      h('div', { class: 'me-card', style: a.cover ? { backgroundImage: `url("${a.cover}")` } : null },
        h('button', { class: 'me-av', onclick: async () => { const src = await pickImage({ max: 400, square: true }); if (src) D.saveAccount({ ...a, avatar: src }); } }, avatar(a.avatar, a.name, 'lg')),
        h('div', { class: 'me-nm' }, h('b', { text: a.name || '我' }), h('small', { text: a.sign || '还没有签名' }))),
      group('我的资料',
        inputRow({ label: '昵称', value: a.name, placeholder: '你的名字', onchange: (v) => D.saveAccount({ ...D.curAccount(), name: v.trim() || '我' }) }),
        inputRow({ label: '签名', value: a.sign, placeholder: '一句话', onchange: (v) => D.saveAccount({ ...D.curAccount(), sign: v.trim() }) }),
        row({ label: '动态封面', value: a.cover ? '已设置' : '默认', onclick: () => coverMenu() })),
      group('我的人设', areaRow({ value: a.persona, placeholder: '你在这个世界里是谁：年龄、职业、性格、和角色们的关系……角色会按这个认识你', rows: 5, onchange: (v) => D.saveAccount({ ...D.curAccount(), persona: v }) })),
      group('世界观', areaRow({ value: a.world, placeholder: '这个身份所在的世界：时代、地点、规则……这个身份下的所有角色共用', rows: 5, onchange: (v) => D.saveAccount({ ...D.curAccount(), world: v }) })),
      group('聊天气泡', h('div', { class: 'bub-pick' }, BUBBLES.map(([k, n, d]) => h('button', { class: 'bp bub-' + k + (a.bubble === k ? ' on' : ''), onclick: () => D.saveAccount({ ...D.curAccount(), bubble: k }) },
        h('span', { class: 'bp-demo' }, h('i', { class: 'bub them', text: '在吗' }), h('i', { class: 'bub me', text: '在' })), h('b', { text: n }), h('small', { text: d }))))),
      group('角色', ...D.chars().map((c) => row({ label: D.nameOf(c), right: h('span', { class: 'row-v', text: c.name !== D.nameOf(c) ? c.name : '' }), onclick: () => editChar(ctx, c.id) })),
        row({ label: '新建角色', icon: 'plus', onclick: () => editChar(ctx, null) })),
      group('身份', row({ label: '切换身份', icon: 'swap', onclick: () => switchAccount(ctx) }),
        D.accounts().length > 1 ? row({ label: '删除这个身份', cls: 'danger', chev: false, onclick: async () => {
          if (!(await confirm('删除这个身份？', `「${a.name}」下面的角色、聊天、日记、动态、线下剧情会全部删掉，不能恢复。`, '删除', true))) return;
          D.removeAccount(a.id);
          toast('删掉了');
        } }) : null),
      note('每个身份是一套独立的你：自己的资料、人设、世界观和角色。点左上角的头像也能切换。'),
    );
  };
  function coverMenu() {
    const a = D.curAccount();
    const s = sheet({ title: '动态封面', body: h('div', {},
      h('button', { class: 'btn wide', text: '从相册选一张', onclick: async () => { s.close(); const src = await pickImage({ max: 1100, quality: 0.82 }); if (src) D.saveAccount({ ...D.curAccount(), cover: src }); } }),
      a.cover ? h('button', { class: 'btn wide ghost', text: '用默认的', onclick: () => { s.close(); D.saveAccount({ ...D.curAccount(), cover: null }); } }) : null) });
  }
  draw();
  const off = D.on('account', draw), off2 = D.on('chars', draw);
  return { el, onShow: draw, destroy: () => { off(); off2(); } };
}

export function switchAccount(ctx) {
  const cur = D.curAccount();
  const body = h('div', { class: 'acc-list' });
  const s = sheet({ title: '切换身份', body });
  for (const a of D.accounts()) {
    body.append(h('button', { class: 'acc-it' + (a.id === cur.id ? ' on' : ''), onclick: () => { s.close(); if (a.id !== cur.id) { D.switchAccount(a.id); toast(`现在是「${a.name}」`); } } },
      avatar(a.avatar, a.name), h('div', {}, h('b', { text: a.name }), h('small', { text: `${D.chars(a.id).length} 个角色${a.world ? ' · ' + a.world.slice(0, 16).replace(/\n/g, ' ') : ''}` })),
      a.id === cur.id ? h('span', { class: 'acc-ck', html: icon('check') }) : null));
  }
  body.append(h('button', { class: 'acc-it add', onclick: () => { s.close(); const a = D.newAccount('新身份'); D.switchAccount(a.id); toast('建好了，去「我的」里写写这个身份'); } },
    h('span', { class: 'av', html: icon('plus') }), h('div', {}, h('b', { text: '新建身份' }), h('small', { text: '另一套资料、人设、世界观和角色' }))));
}
