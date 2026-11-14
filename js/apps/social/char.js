// 角色资料：新建 / 看 / 改。头像、名字、备注、人设（一行，点进去整页改）、认识谁、他的生活（开了才展开）、聊天背景（图 + 大小·模糊·淡）、模型参数（滑条）、日记 / 备忘录 / 线下入口
// 平时只能看；右上角 ⭕ 点了才能改，变成 ✅，点 ✅ 问一句再存。改到一半要走也问一句。新建的一进来就能改。
import { h, page, avatar, group, row, inputRow, textRow, toast, confirm, stepRow, slideRow, foldRow, icon, modeBtn, askSave, askLeave, $ } from '../../core/ui.js';
import { pickCrop } from '../../core/crop.js';
import * as D from '../../core/data.js';
import { openApp } from '../../phone/window.js';
import * as CS from '../../core/chat.js';

/** 模型参数的三根滑条（线下自己写的故事也用这个）。ro = 只能看 */
export function genRows(g, ro = false) {
  return [
    slideRow({ label: '温度', value: g.temperature, min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2), onchange: (v) => { g.temperature = v; }, ro }),
    slideRow({ label: 'Token 上限', value: g.maxTokens, min: 200, max: 8000, step: 100, fmt: (v) => String(v), onchange: (v) => { g.maxTokens = v; }, ro }),
    slideRow({ label: '上下文', value: g.histLen, min: 10, max: 200, step: 5, fmt: (v) => v + ' 条', onchange: (v) => { g.histLen = v; }, ro }),
  ];
}

export function editChar(ctx, cid) {
  const isNew = !cid;
  const load = () => {
    const x = isNew ? D.newChar() : structuredClone(D.charById(cid));
    if (!x) return null;
    x.life = D.lifeOf(x);
    x.gen = D.genOf(x);
    x.bg = D.chatBgOf(x);
    return x;
  };
  let c = load();
  if (!c) return;
  // 聊天背景的图：改的时候先放在这里（undefined = 没动过），存的时候才写进 file.chatbg.<id>
  let bgSrc;
  const bgNow = () => (bgSrc === undefined ? D.file('chatbg.' + c.id) : bgSrc);
  let editing = isNew, snap = JSON.stringify(c);
  const changed = () => JSON.stringify(c) !== snap || bgSrc !== undefined;
  const mode = modeBtn(() => (editing ? commit() : start()));
  mode.set(editing);
  const pg = page({ title: isNew ? '新建角色' : '资料', onBack: () => back(), right: mode });
  pg.el.classList.add('ce');
  const nav = { push: (p) => ctx.push(p), pop: () => ctx.stack.pop() };

  function start() { editing = true; c = load(); bgSrc = undefined; snap = JSON.stringify(c); mode.set(true); draw(); }
  async function back() {
    document.activeElement?.blur();
    await tick();
    if (!editing || !changed()) { ctx.stack.pop(); return; }
    const r = await askLeave();
    if (r === 'save') { if (save()) ctx.stack.pop(); }
    else if (r === 'drop') ctx.stack.pop();
  }
  async function commit() {
    document.activeElement?.blur();
    await tick();
    if (!c.name) { toast('写个名字'); return; }
    if (isNew) { save(); toast('建好了'); ctx.stack.pop(); return; }
    if (changed()) { if (!(await askSave())) return; save(); toast('保存了'); }
    editing = false; mode.set(false); draw();
  }
  function save() {
    if (!c.name) { toast('写个名字'); return false; }
    // 保存前再拿一次最新的（后台可能刚给他起了邮箱名、记下了你的邮箱）
    const fresh = D.charById(c.id);
    if (fresh) for (const k of ['mail', 'knowMail', 'mailTried']) if (fresh[k] !== undefined) c[k] = fresh[k];
    delete c.net; delete c.sign; delete c.profileTried;
    if (bgSrc !== undefined) { D.setFile('chatbg.' + c.id, bgSrc); bgSrc = undefined; }
    D.saveChar(c);
    snap = JSON.stringify(c);
    return true;
  }

  const draw = () => {
    const ro = !editing;
    const top = pg.scroll.scrollTop;
    pg.scroll.innerHTML = '';
    const av = h('button', { class: 'ce-av', disabled: ro, onclick: async () => { const r = await pickCrop({ aspect: 1, width: 400, round: true, title: '头像' }); if (r) { c.avatar = r.src; draw(); } } },
      avatar(c.avatar, c.name, 'lg'), ro ? null : h('span', { class: 'ce-cam', html: icon('camera') }));
    const L = c.life, setL = (k) => (v) => { L[k] = v; };
    const step = (label, k, min, max, st, unit) => stepRow({ label, value: L[k], min, max, step: st, unit, onchange: setL(k), ro });
    const others = D.chars().filter((x) => x.id !== c.id);
    pg.scroll.append(
      h('div', { class: 'ce-head' }, av, c.avatar && !ro ? h('button', { class: 'ce-av-x', text: '去掉头像', onclick: () => { c.avatar = null; draw(); } }) : null),
      group('', inputRow({ label: '名字', value: c.name, ro, live: true, onchange: (v) => { c.name = v.trim(); } }),
        inputRow({ label: '昵称', value: c.nick, ro, live: true, onchange: (v) => { c.nick = v.trim(); } }),
        textRow({ label: '人设', value: c.persona, nav, ro, onSave: (v) => { c.persona = v; draw(); } })),
      others.length ? group('他认识谁', ...others.map((o) => {
        const sw = h('input', { type: 'checkbox', class: 'sw', disabled: ro });
        sw.checked = (c.knows || []).includes(o.id);
        sw.addEventListener('change', () => { c.knows = sw.checked ? [...new Set([...(c.knows || []), o.id])] : (c.knows || []).filter((k) => k !== o.id); });
        return h('label', { class: 'row' }, avatar(o.avatar, D.nameOf(o), 'xs'), h('span', { class: 'row-l', text: D.nameOf(o) }), sw);
      })) : null,
      group('他的生活',
        foldRow({ label: '很久没聊会来找你', value: L.away, onchange: setL('away'), ro, kids: [step('多久算久', 'awayHours', 1, 72, 1, ' 小时')] }),
        foldRow({ label: '自己发动态', value: L.post, onchange: setL('post'), ro, kids: [step('大概多久一条', 'postHours', 2, 168, 2, ' 小时')] }),
        foldRow({ label: '自己写日记', value: L.diary, onchange: setL('diary'), ro, kids: [step('至少隔多久', 'diaryHours', 2, 72, 2, ' 小时')] }),
        foldRow({ label: '自己写信', value: L.mail, onchange: setL('mail'), ro, kids: [step('大概多久一封', 'mailDays', 1, 30, 1, ' 天')] }),
        foldRow({ label: '别打扰的时间', value: L.quiet, onchange: setL('quiet'), ro, kids: [step('从', 'quietFrom', 0, 23, 1, ' 点'), step('到', 'quietTo', 0, 23, 1, ' 点')] })),
      bgGroup(ro),
      group('模型', ...genRows(c.gen, ro)),
      // 看的时候：日记、备忘录、线下的入口；改的时候：删聊天记录、删角色
      !isNew && ro ? group('', row({ label: '日记', icon: 'book', onclick: () => openApp('diary', { char: c.id }) }),
        row({ label: '他记得的关于你的事', icon: 'note', onclick: () => openApp('memo', { char: c.id }) }),
        row({ label: '线下见面', icon: 'door', onclick: () => { const st = D.storiesOf().find((s) => s.char === c.id); openApp('offline', st ? { story: st.id } : { newFor: c.id }); } })) : null,
      !isNew && !ro ? group('',
        // 只删聊天记录，日记、备忘录都留着（要删去它们自己的页面里删）。点了直接删；删完这一行就没了
        D.msgs(c.id).length ? row({ label: '删除聊天记录', cls: 'danger center', chev: false, onclick: (e) => { CS.clearChat(c.id); e.currentTarget.remove(); } }) : null,
        row({ label: '删除这个角色', cls: 'danger center', chev: false, onclick: async () => {
          if (!(await confirm('删除角色？', `${D.nameOf(c)} 的聊天、日记、备忘录、动态、线下剧情都会一起删掉，不能恢复。`, '删除', true))) return;
          D.removeChar(c.id);
          while (ctx.stack.pages.length > 1) { const p = ctx.stack.pages.pop(); p.el.remove(); p.shade?.remove(); p.onDestroy?.(); }
          ctx.stack.top.el.style.transform = '';
        } })) : null,
    );
    pg.el.classList.toggle('ro', ro);
    pg.scroll.scrollTop = top;
  };
  // 聊天背景：左边一个小预览（跟聊天页一样的比例，滑条一动就跟着变），点它换图（裁成手机屏幕的比例），垃圾桶去掉。
  // 有图才有三根滑条。只能看的时候没图就整组不出现
  function bgGroup(ro) {
    const src = bgNow();
    if (ro && !src) return null;
    const pre = h('button', { class: 'cb-pre' + (src ? ' on' : ''), disabled: ro, 'aria-label': '换聊天背景', onclick: async () => {
      const dev = $('#device').getBoundingClientRect();
      const r = await pickCrop({ aspect: dev.width / dev.height, width: 900, title: '聊天背景' });
      if (r) { bgSrc = r.src; draw(); }
    } }, src ? h('i') : h('span', { html: icon('image') }));
    const paint = () => {
      const b = c.bg;
      pre.style.setProperty('--cbg', src ? `url("${src}")` : 'none');
      pre.style.setProperty('--cbs', String(b.size / 100));
      pre.style.setProperty('--cbb', (b.blur * 60) / 393 + 'px'); // 预览小，模糊按比例缩
      pre.style.setProperty('--cbv', String(b.veil));
    };
    paint();
    const set = (k, f = (v) => v) => (v) => { c.bg = { ...c.bg, [k]: f(v) }; paint(); };
    return group('聊天背景',
      h('div', { class: 'row cb-row' }, pre, src && !ro ? h('button', { class: 'rs-x', 'aria-label': '去掉聊天背景', html: icon('trash'), onclick: () => { bgSrc = null; draw(); } }) : null),
      src ? slideRow({ label: '大小', value: c.bg.size, min: 100, max: 300, step: 5, fmt: (v) => v + '%', onchange: set('size'), ro }) : null,
      src ? slideRow({ label: '模糊', value: c.bg.blur, min: 0, max: 30, step: 1, fmt: (v) => String(v), onchange: set('blur'), ro }) : null,
      src ? slideRow({ label: '淡', value: Math.round(c.bg.veil * 100), min: 0, max: 95, step: 1, fmt: (v) => v + '%', onchange: set('veil', (v) => v / 100), ro }) : null);
  }
  draw();
  ctx.push({ el: pg.el, guard: () => editing && changed(), onBack: back });
}

// 输入框的 change 在失焦时才来：先收键盘，等一下再读
const tick = () => new Promise((r) => setTimeout(r, 30));
