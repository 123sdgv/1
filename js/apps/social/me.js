// 我的：当前身份的资料、邮箱、人设、世界观、动态封面。切换 / 新建 / 删除身份都在左上角头像点出来的面板里
import { h, avatar, group, row, inputRow, areaRow, toast, confirm, sheet, icon, menu, longPress } from '../../core/ui.js';
import { pickCrop } from '../../core/crop.js';
import * as D from '../../core/data.js';

export function mePane(ctx) {
  const el = h('div', { class: 'so-pane scroll' });
  const draw = () => {
    const a = D.curAccount();
    el.innerHTML = '';
    el.append(
      h('div', { class: 'me-card', style: a.cover ? { backgroundImage: `url("${a.cover}")` } : null },
        h('button', { class: 'me-av', onclick: async () => { const r = await pickCrop({ aspect: 1, width: 400, round: true, title: '头像' }); if (r) D.saveAccount({ ...D.curAccount(), avatar: r.src }); } }, avatar(a.avatar, a.name, 'lg')),
        h('div', { class: 'me-nm' }, h('b', { text: a.name || '我' }), a.sign ? h('small', { text: a.sign }) : null)),
      group('我的资料',
        inputRow({ label: '昵称', value: a.name, onchange: (v) => D.saveAccount({ ...D.curAccount(), name: v.trim() || '我' }) }),
        inputRow({ label: '签名', value: a.sign, onchange: (v) => D.saveAccount({ ...D.curAccount(), sign: v.trim() }) }),
        mailRow(a),
        row({ label: '动态封面', value: a.cover ? '已设置' : '默认', onclick: () => coverMenu() })),
      group('我的人设', areaRow({ value: a.persona, rows: 5, onchange: (v) => D.saveAccount({ ...D.curAccount(), persona: v }) })),
      group('世界观', areaRow({ value: a.world, rows: 5, onchange: (v) => D.saveAccount({ ...D.curAccount(), world: v }) })),
    );
  };
  // 邮箱：只填 @ 前面的，一个身份一个
  function mailRow(a) {
    const inp = h('input', { class: 'row-in', value: a.mail || '', type: 'email', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    inp.addEventListener('change', () => {
      const v = inp.value.trim().toLowerCase().replace(/@.*$/, '');
      if (v && !/^[a-z0-9][a-z0-9._]{1,29}$/.test(v)) { toast('只能用小写字母、数字、点、下划线'); inp.value = a.mail || ''; return; }
      if (v && v !== a.mail && D.freeMailName(v) !== v) { toast('这个被用了，换一个'); inp.value = a.mail || ''; return; }
      D.saveAccount({ ...D.curAccount(), mail: v });
    });
    return h('label', { class: 'row' }, h('span', { class: 'row-l', text: '邮箱' }), inp, h('span', { class: 'row-sfx', text: '@' + D.MAIL_DOMAIN }));
  }
  function coverMenu() {
    const a = D.curAccount();
    const s = sheet({ title: '动态封面', body: h('div', {},
      h('button', { class: 'btn wide', text: '从相册选一张', onclick: async () => { s.close(); const r = await pickCrop({ aspect: 1.6, width: 1100, title: '动态封面', quality: 0.84 }); if (r) D.saveAccount({ ...D.curAccount(), cover: r.src }); } }),
      a.cover ? h('button', { class: 'btn wide ghost', text: '用默认的', onclick: () => { s.close(); D.saveAccount({ ...D.curAccount(), cover: null }); } }) : null) });
  }
  draw();
  const off = D.on('account', draw);
  return { el, onShow: draw, destroy: () => { off(); } };
}

/** 切换身份（左上角头像）：点一个切过去，长按删除，最后一个是新建 */
export function switchAccount(ctx) {
  const cur = D.curAccount();
  const body = h('div', { class: 'acc-list' });
  const s = sheet({ title: '切换身份', body });
  for (const a of D.accounts()) {
    const it = h('button', { class: 'acc-it' + (a.id === cur.id ? ' on' : ''), onclick: () => { s.close(); if (a.id !== cur.id) { D.switchAccount(a.id); toast(`现在是「${a.name}」`); } } },
      avatar(a.avatar, a.name), h('div', {}, h('b', { text: a.name }), h('small', { text: `${D.chars(a.id).length} 个角色${a.mail ? ' · ' + D.addrOf(a.mail) : ''}` })),
      a.id === cur.id ? h('span', { class: 'acc-ck', html: icon('check') }) : null);
    if (D.accounts().length > 1) longPress(it, () => menu([['删除这个身份', async () => {
      if (!(await confirm('删除这个身份？', `「${a.name}」下面的角色、聊天、日记、动态、邮件、线下剧情会全部删掉，不能恢复。`, '删除', true))) return;
      s.close();
      D.removeAccount(a.id);
      toast('删掉了');
    }, 'danger']], a.name));
    body.append(it);
  }
  body.append(h('button', { class: 'acc-it add', onclick: () => { s.close(); const a = D.newAccount('新身份'); D.switchAccount(a.id); toast('建好了'); } },
    h('span', { class: 'av', html: icon('plus') }), h('div', {}, h('b', { text: '新建身份' }))));
}
