// 表情包：所有身份、所有角色共用的一套图。每张配一句说明（这张是什么意思），角色按说明挑着用。
import { h, sheet, menu, confirm, toast, longPress, icon, inlineEdit } from '../../core/ui.js';
import * as D from '../../core/data.js';

/** 表情包面板：点一张就是选它；最后一格是添加；长按改说明（原地改）、删除 */
export function stickerSheet(onPick) {
  const grid = h('div', { class: 'stk-grid' });
  const s = sheet({ title: '表情包', body: h('div', {}, grid) });
  const draw = () => {
    grid.innerHTML = '';
    for (const st of D.stickers()) {
      const b = h('button', { class: 'stk-it', onclick: () => { s.close(); onPick(st); } }, h('img', { src: st.src, alt: st.name, draggable: 'false' }), h('small', { text: st.name }));
      longPress(b, () => menu([
        // 改说明：就在这张下面那行字上改（不弹框）
        ['改说明', () => {
          const lb = h('small');
          const box = h('div', { class: 'stk-it editing' }, h('img', { src: st.src, alt: '', draggable: 'false' }), lb);
          b.replaceWith(box);
          inlineEdit(lb, st.name, { oneLine: true, save: (v) => { if (!v) { toast('写一下是什么意思'); return false; } D.setStickers(D.stickers().map((x) => (x.id === st.id ? { ...x, name: v } : x))); }, done: () => draw() });
        }],
        ['删掉', async () => { if (await confirm('删掉这张表情？', '', '删掉', true)) { D.setStickers(D.stickers().filter((x) => x.id !== st.id)); draw(); } }, 'danger'],
      ], st.name));
      grid.append(b);
    }
    grid.append(h('button', { class: 'stk-it add', 'aria-label': '添加', onclick: () => addStickers(draw) }, h('span', { html: icon('plus') })));
  };
  draw();
  return s;
}

// 选几张图 → 给每张写说明 → 存
function addStickers(after) {
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
  document.body.append(inp);
  inp.addEventListener('change', async () => {
    const files = [...(inp.files || [])];
    inp.remove();
    if (!files.length) return;
    const items = [];
    for (const f of files.slice(0, 30)) { try { items.push({ src: await stickerSrc(f), name: '' }); } catch { toast('有一张读不出来，跳过了'); } }
    if (!items.length) return;
    const list = h('div', { class: 'stk-new' });
    for (const it of items) {
      const nm = h('input', { class: 'dlg-in', autocomplete: 'off' });
      nm.addEventListener('input', () => { it.name = nm.value.trim(); });
      list.append(h('label', { class: 'stk-new-it' }, h('img', { src: it.src, alt: '' }), nm));
    }
    const s = sheet({ title: items.length > 1 ? `给这 ${items.length} 张写说明` : '给这张写说明', full: items.length > 3, body: h('div', {}, list,
      h('button', { class: 'btn wide', text: '存好', onclick: () => {
        document.activeElement?.blur();
        if (items.some((x) => !x.name)) { toast('每张都写一下是什么意思'); return; }
        D.setStickers([...D.stickers(), ...items.map((x) => ({ id: D.uid(), name: x.name, src: x.src }))]);
        s.close();
        toast('存好了');
        after?.();
      } })) });
    setTimeout(() => list.querySelector('input')?.focus(), 350);
  });
  inp.click();
}

// 动图小于 1.2MB 原样存（保住动画）；其他的缩到 320px，带透明的存 PNG
async function stickerSrc(file) {
  if (file.type === 'image/gif' && file.size < 1.2e6) return await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(file); });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = h('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return /png|webp|gif/.test(file.type) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}
