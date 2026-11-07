// 角色资料：新建 / 编辑。头像、名字、备注、人设、认识谁、他的生活（开了才展开）、模型参数（滑条）、日记 / 备忘录 / 线下入口
import { h, page, avatar, group, row, inputRow, areaRow, toast, confirm, stepRow, slideRow, foldRow, icon } from '../../core/ui.js';
import { pickCrop } from '../../core/crop.js';
import * as D from '../../core/data.js';
import { openApp } from '../../phone/window.js';

/** 模型参数的三根滑条（线下自己写的故事也用这个） */
export function genRows(g) {
  return [
    slideRow({ label: '温度', value: g.temperature, min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2), onchange: (v) => { g.temperature = v; } }),
    slideRow({ label: 'Token 上限', value: g.maxTokens, min: 200, max: 8000, step: 100, fmt: (v) => String(v), onchange: (v) => { g.maxTokens = v; } }),
    slideRow({ label: '上下文', value: g.histLen, min: 10, max: 200, step: 5, fmt: (v) => v + ' 条', onchange: (v) => { g.histLen = v; } }),
  ];
}

export function editChar(ctx, cid) {
  const isNew = !cid;
  const c = isNew ? D.newChar() : structuredClone(D.charById(cid));
  if (!c) return;
  c.life = D.lifeOf(c);
  c.gen = D.genOf(c);
  const saveBtn = h('button', { class: 'tbtn', text: isNew ? '完成' : '保存' });
  const pg = page({ title: isNew ? '新建角色' : '资料', onBack: () => ctx.stack.pop(), right: saveBtn });
  pg.el.classList.add('ce');
  const draw = () => {
    pg.scroll.innerHTML = '';
    const av = h('button', { class: 'ce-av', onclick: async () => { const r = await pickCrop({ aspect: 1, width: 400, round: true, title: '头像' }); if (r) { c.avatar = r.src; draw(); } } }, avatar(c.avatar, c.name, 'lg'), h('span', { class: 'ce-cam', html: icon('camera') }));
    const L = c.life, setL = (k) => (v) => { L[k] = v; };
    const step = (label, k, min, max, st, unit) => stepRow({ label, value: L[k], min, max, step: st, unit, onchange: setL(k) });
    const others = D.chars().filter((x) => x.id !== c.id);
    pg.scroll.append(
      h('div', { class: 'ce-head' }, av, c.avatar ? h('button', { class: 'ce-av-x', text: '去掉头像', onclick: () => { c.avatar = null; draw(); } }) : null),
      group('', inputRow({ label: '名字', value: c.name, onchange: (v) => { c.name = v.trim(); } }),
        inputRow({ label: '昵称', value: c.nick, onchange: (v) => { c.nick = v.trim(); } })),
      group('人设', areaRow({ value: c.persona, rows: 8, onchange: (v) => { c.persona = v; } })),
      others.length ? group('他认识谁', ...others.map((o) => {
        const sw = h('input', { type: 'checkbox', class: 'sw' });
        sw.checked = (c.knows || []).includes(o.id);
        sw.addEventListener('change', () => { c.knows = sw.checked ? [...new Set([...(c.knows || []), o.id])] : (c.knows || []).filter((k) => k !== o.id); });
        return h('label', { class: 'row' }, avatar(o.avatar, D.nameOf(o), 'xs'), h('span', { class: 'row-l', text: D.nameOf(o) }), sw);
      })) : null,
      group('他的生活',
        foldRow({ label: '很久没聊会来找你', value: L.away, onchange: setL('away'), kids: [step('多久算久', 'awayHours', 1, 72, 1, ' 小时')] }),
        foldRow({ label: '自己发动态', value: L.post, onchange: setL('post'), kids: [step('大概多久一条', 'postHours', 2, 168, 2, ' 小时')] }),
        foldRow({ label: '自己写日记', value: L.diary, onchange: setL('diary'), kids: [step('至少隔多久', 'diaryHours', 2, 72, 2, ' 小时')] }),
        foldRow({ label: '自己写信', value: L.mail, onchange: setL('mail'), kids: [step('大概多久一封', 'mailDays', 1, 30, 1, ' 天')] }),
        foldRow({ label: '别打扰的时间', value: L.quiet, onchange: setL('quiet'), kids: [step('从', 'quietFrom', 0, 23, 1, ' 点'), step('到', 'quietTo', 0, 23, 1, ' 点')] })),
      group('模型', ...genRows(c.gen)),
      !isNew ? group('', row({ label: '日记', icon: 'book', onclick: () => openApp('diary', { char: c.id }) }),
        row({ label: '他记得的关于你的事', icon: 'note', onclick: () => openApp('memo', { char: c.id }) }),
        row({ label: '线下见面', icon: 'door', onclick: () => { const st = D.storiesOf().find((s) => s.char === c.id); openApp('offline', st ? { story: st.id } : { newFor: c.id }); } })) : null,
      !isNew ? group('', row({ label: '删除这个角色', cls: 'danger center', chev: false, onclick: async () => {
        if (!(await confirm('删除角色？', `${D.nameOf(c)} 的聊天、日记、备忘录、动态、线下剧情都会一起删掉，不能恢复。`, '删除', true))) return;
        D.removeChar(c.id);
        while (ctx.stack.pages.length > 1) { const p = ctx.stack.pages.pop(); p.el.remove(); p.shade?.remove(); p.onDestroy?.(); }
        ctx.stack.top.el.style.transform = '';
      } })) : null,
    );
  };
  saveBtn.onclick = () => {
    document.activeElement?.blur();
    setTimeout(() => {
      if (!c.name) { toast('写个名字'); return; }
      // 保存前再拿一次最新的（后台可能刚给他起了邮箱名、记下了你的邮箱）
      const fresh = D.charById(c.id);
      if (fresh) for (const k of ['mail', 'knowMail', 'mailTried']) if (fresh[k] !== undefined) c[k] = fresh[k];
      delete c.net; delete c.sign; delete c.profileTried;
      D.saveChar(c);
      toast(isNew ? '建好了' : '保存了');
      ctx.stack.pop();
    }, 30);
  };
  draw();
  ctx.push({ el: pg.el });
}
