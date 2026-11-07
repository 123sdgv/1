// 设置：API、锁屏密码和壁纸（裁剪、模糊）、备份。角色的生活在每个角色的资料里设
import { h, Stack, page, group, row, inputRow, stepRow, note, toast, confirm, dialog, sheet, download, menu } from '../../core/ui.js';
import { pickCrop } from '../../core/crop.js';
import { isLocked } from '../../phone/lock.js';
import * as D from '../../core/data.js';
import * as S from '../../core/store.js';
import { testApi, listModels, endpoint } from '../../core/api.js';
import { ymd } from '../../core/time.js';

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '设置', big: true, left: h('span') });
  pg.el.classList.add('set');
  const draw = () => {
    pg.scroll.querySelectorAll(':scope > :not(.bigttl)').forEach((x) => x.remove());
    const a = D.api(), lk = D.lockConf();
    pg.scroll.append(
      group('', row({ label: 'API', icon: 'key', value: a.base && a.model ? a.model : '还没填', onclick: apiPage })),
      note('多久来找你、发动态、写日记、几点别打扰，在每个角色的资料里单独设。'),
      group('锁屏与壁纸',
        row({ label: '锁屏密码', value: lk.pass ? '已设置' : '没有', onclick: passMenu }),
        row({ label: '锁屏壁纸', value: D.file('wallLock') ? '自己的图' : '默认', onclick: () => wallMenu('wallLock', '锁屏壁纸') }),
        row({ label: '主屏幕壁纸', value: D.file('wallHome') ? '自己的图' : '默认', onclick: () => wallMenu('wallHome', '主屏幕壁纸') })),
      group('数据',
        row({ label: '导出备份', icon: 'down', onclick: exportData }),
        row({ label: '导入备份', icon: 'up', onclick: importData }),
        row({ label: '抹掉所有内容', cls: 'danger', chev: false, onclick: wipe })),
      note('所有东西都只存在这台设备的浏览器里，清理浏览器数据会丢，记得时不时导出。导出的文件不含 API Key。'),
    );
  };

  function apiPage() {
    const a = D.api();
    const v = { base: a.base, key: a.key, model: a.model };
    const st = D.settings();
    const p = page({ title: 'API', onBack: () => { stack.pop(); draw(); } });
    const modelRow = inputRow({ label: '模型', value: v.model, placeholder: '比如 gpt-4o-mini', onchange: (x) => { v.model = x.trim(); save(); } });
    const result = h('p', { class: 'grp-note api-res' });
    const save = () => D.setApi(v);
    p.scroll.append(
      group('接口（OpenAI 兼容）',
        inputRow({ label: '地址', value: v.base, placeholder: 'https://…/v1', onchange: (x) => { v.base = x.trim(); save(); hint(); } }),
        inputRow({ label: 'Key', value: v.key, placeholder: 'sk-…', type: 'password', onchange: (x) => { v.key = x.trim(); save(); } }),
        modelRow,
        row({ label: '从这家拉模型列表', onclick: async () => {
          try {
            const list = await listModels();
            if (!list.length) { toast('这家没给模型列表，手动填吧'); return; }
            menu(list.slice(0, 60).map((m) => [m, () => { v.model = m; modelRow.querySelector('input').value = m; save(); }]), '选一个模型');
          } catch (e) { toast(e.message); }
        } })),
      result,
      h('button', { class: 'btn wide', text: '测试连接', onclick: async (e) => {
        document.activeElement?.blur();
        const b = e.currentTarget; b.disabled = true; b.textContent = '测试中…';
        result.textContent = '';
        try { const r = await testApi(); result.textContent = `连上了（${r.ms} 毫秒），回了：${r.text || '（空）'}`; }
        catch (err) { result.textContent = '没连上：' + err.message; }
        finally { b.disabled = false; b.textContent = '测试连接'; }
      } }),
      group('生成',
        stepRow({ label: '温度', value: st.temperature, min: 0, max: 2, step: 0.1, onchange: (x) => D.setSettings({ temperature: x }) }),
        stepRow({ label: '最长回复', value: st.maxTokens, min: 200, max: 8000, step: 100, unit: ' tok', onchange: (x) => D.setSettings({ maxTokens: x }) }),
        stepRow({ label: '带多少条聊天记录', value: st.histLen, min: 10, max: 200, step: 10, unit: ' 条', onchange: (x) => D.setSettings({ histLen: x }) })),
      note('温度越高越随性。聊天记录带得越多越连贯，也越费额度；更早的事靠日记和备忘录记着。'));
    const hint = () => { const u = endpoint(v.base); result.textContent = u ? '实际请求：' + u : ''; };
    hint();
    stack.push({ el: p.el });
  }

  function passMenu() {
    const lk = D.lockConf();
    const set = async () => {
      const a = await dialog({ title: '新密码', text: '4 到 6 位数字', input: { type: 'password', inputmode: 'numeric', placeholder: '••••' }, buttons: [['取消', false], ['下一步', true, 'main']] });
      if (a == null) return;
      if (!/^\d{4,6}$/.test(a)) { toast('要 4 到 6 位数字'); return; }
      const b = await dialog({ title: '再输一遍', input: { type: 'password', inputmode: 'numeric', placeholder: '••••' }, buttons: [['取消', false], ['好', true, 'main']] });
      if (b == null) return;
      if (a !== b) { toast('两次不一样'); return; }
      D.setLock({ pass: a });
      toast('设好了');
      draw();
    };
    if (!lk.pass) { set(); return; }
    menu([['改密码', set], ['关掉密码', () => { D.setLock({ pass: '' }); toast('关掉了'); draw(); }, 'danger']], '锁屏密码');
  }

  // 壁纸：选图 → 按屏幕比例裁 → 调模糊。换好以后还能单独再调模糊
  function wallMenu(k, title) {
    const dev = document.getElementById('device');
    const aspect = dev.clientWidth / dev.clientHeight;
    menu([
      ['从相册选一张', async () => {
        const r = await pickCrop({ aspect, width: Math.min(1290, Math.round(dev.clientWidth * 3)), blur: D.wallBlur(k), title, quality: 0.86 });
        if (!r) return;
        D.setFile(k, r.src); D.setWallBlur(k, r.blur); toast('换好了'); draw();
      }],
      D.file(k) ? ['调模糊', () => blurSheet(k, title)] : null,
      D.file(k) ? ['用默认的', () => { D.setFile(k, null); D.setWallBlur(k, 0); draw(); }] : null,
    ], title);
  }
  function blurSheet(k, title) {
    const before = D.wallBlur(k);
    const val = h('b', { text: before + '' });
    const range = h('input', { type: 'range', min: 0, max: 30, value: before, class: 'cr-range' });
    // 拖的时候直接改壁纸。调的时候先让设置窗口让开（主屏幕）或者把锁屏露出来，看得到效果
    const win = document.querySelector('.win'), lock = document.getElementById('lock');
    range.addEventListener('input', () => { val.textContent = range.value; D.setWallBlur(k, +range.value); });
    if (k === 'wallLock') { lock.hidden = false; lock.classList.remove('gone'); lock.classList.add('peek'); }
    else win?.classList.add('peek');
    sheet({ title: title + '模糊', cls: 'blur-sheet', body: h('div', { class: 'blur-row' }, range, val),
      onClose: () => {
        win?.classList.remove('peek');
        if (k === 'wallLock') { lock.classList.add('gone'); lock.classList.remove('peek'); setTimeout(() => { if (!isLocked()) lock.hidden = true; }, 420); }
        draw();
      } });
  }

  async function exportData() {
    const data = await S.exportAll();
    download(`小手机备份-${ymd()}.json`, JSON.stringify(data));
    toast('导出了');
  }
  function importData() {
    const inp = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    document.body.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!(await confirm('导入这个备份？', '现在手机里的内容会被备份里的替换掉（API Key 保留）。', '导入', true))) return;
        await S.importAll(obj);
        toast('导入好了，正在重新打开');
        setTimeout(() => location.reload(), 900);
      } catch (e) { toast('导入失败：' + e.message); }
    });
    inp.click();
  }
  async function wipe() {
    if (!(await confirm('抹掉所有内容？', '身份、角色、聊天、日记、动态、设置、API Key 全部清空，不能恢复。建议先导出备份。', '抹掉', true))) return;
    await S.wipe();
    location.reload();
  }

  stack.root({ el: pg.el, onShow: draw });
  draw();
  return { destroy: () => stack.destroyAll() };
}
