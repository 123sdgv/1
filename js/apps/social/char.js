// 角色资料：新建 / 编辑。头像、名字、备注、网名和签名（可以让他自己起）、人设、认识谁
import { h, page, avatar, group, row, inputRow, areaRow, note, pickImage, toast, confirm, btnIc } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { makeProfile } from '../../core/life.js';
import { openApp } from '../../phone/window.js';

export function editChar(ctx, cid) {
  const isNew = !cid;
  const c = isNew ? D.newChar() : structuredClone(D.charById(cid));
  if (!c) return;
  const saveBtn = h('button', { class: 'tbtn', text: isNew ? '完成' : '保存' });
  const pg = page({ title: isNew ? '新建角色' : '资料', onBack: () => ctx.stack.pop(), right: saveBtn, big: false });
  const draw = () => {
    pg.scroll.innerHTML = '';
    const av = h('button', { class: 'ce-av', onclick: async () => { const src = await pickImage({ max: 400, square: true }); if (src) { c.avatar = src; draw(); } } }, avatar(c.avatar, c.name, 'lg'), h('small', { text: c.avatar ? '换头像' : '设置头像' }));
    const netRow = inputRow({ label: '网名', value: c.net, placeholder: '他自己起', onchange: (v) => { c.net = v.trim(); } });
    const signRow = inputRow({ label: '签名', value: c.sign, placeholder: '他自己写', onchange: (v) => { c.sign = v.trim(); } });
    const others = D.chars().filter((x) => x.id !== c.id);
    pg.scroll.append(
      h('div', { class: 'ce-head' }, av, c.avatar ? h('button', { class: 'ce-av-x', text: '去掉头像', onclick: () => { c.avatar = null; draw(); } }) : null),
      group('', inputRow({ label: '名字', value: c.name, placeholder: '他的名字', onchange: (v) => { c.name = v.trim(); } }),
        inputRow({ label: '昵称', value: c.nick, placeholder: '你给他的备注', onchange: (v) => { c.nick = v.trim(); } })),
      group('他在社交软件上的样子', netRow, signRow,
        row({ label: '让他自己起网名和签名', icon: 'wand', onclick: async (e) => {
          if (!c.name) { toast('先写名字和人设'); return; }
          const b = e.currentTarget; b.disabled = true; b.querySelector('.row-l').textContent = '他在想…';
          try { const saved = D.saveChar({ ...c }); const r = await makeProfile(saved); c.net = r.net; c.sign = r.sign; draw(); toast('起好了'); }
          catch (err) { toast(err.message); b.disabled = false; b.querySelector('.row-l').textContent = '让他自己起网名和签名'; }
        } })),
      note('空着也行：保存后他会在后台自己起。'),
      group('人设', areaRow({ value: c.persona, placeholder: '性格、背景、说话方式、和你是什么关系……写什么都行，越具体越像', rows: 8, onchange: (v) => { c.persona = v; } })),
      others.length ? group('他认识谁', ...others.map((o) => {
        const sw = h('input', { type: 'checkbox', class: 'sw' });
        sw.checked = (c.knows || []).includes(o.id);
        sw.addEventListener('change', () => { c.knows = sw.checked ? [...new Set([...(c.knows || []), o.id])] : (c.knows || []).filter((k) => k !== o.id); });
        return h('label', { class: 'row' }, avatar(o.avatar, D.nameOf(o), 'xs'), h('span', { class: 'row-l', text: D.nameOf(o) }), sw);
      })) : null,
      others.length ? note('认识的人会互相在动态下面点赞、评论，他也知道那些人是谁。') : null,
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
      D.saveChar(c);
      toast(isNew ? '建好了' : '保存了');
      ctx.stack.pop();
    }, 30);
  };
  draw();
  ctx.push({ el: pg.el });
}
