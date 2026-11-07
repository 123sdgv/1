// 入口：读存档 → 壁纸 → 主屏幕 → 锁屏 → 后台补算
import * as S from './core/store.js';
import * as D from './core/data.js';
import { h, $, avatar } from './core/ui.js';
import { buildHome } from './phone/home.js';
import { initLock, isLocked } from './phone/lock.js';
import { openApp, currentApp } from './phone/window.js';
import { startLife } from './core/life.js';
import { isViewing } from './core/chat.js';
import { appIcon } from './phone/icons.js';

// 壁纸图和模糊度放在 CSS 变量里（锁屏的图在 ::before 上，模糊不会糊到时间和通知）
function walls() {
  const set = (el, k) => {
    const src = D.file(k);
    el.style.setProperty('--wall', src ? `url("${src}")` : 'none');
    el.style.setProperty('--wb', (src ? D.wallBlur(k) : 0) + 'px');
    el.classList.toggle('def', !src);
  };
  set($('#wall'), 'wallHome');
  set($('#lock'), 'wallLock');
}

// 顶部横幅：不在那个对话里时，来消息了从上面滑下来
function banner({ cid, moment, diary, mail, text }) {
  if (isLocked()) return;
  if (cid && isViewing(cid)) return;
  if (diary && currentApp() === 'diary') return;
  if (moment && currentApp() === 'social') return;
  if (mail && currentApp() === 'mail') return;
  const c = cid ? D.charById(cid) : null;
  const app = cid || moment ? 'social' : diary ? 'diary' : mail ? 'mail' : null;
  const el = h('button', { class: 'banner' },
    c ? avatar(c.avatar, D.nameOf(c), 'sm') : h('span', { class: 'banner-ic', html: appIcon(app || 'social') }),
    h('div', {}, h('b', { text: c ? D.nameOf(c) : moment ? '动态' : mail ? '邮箱' : '日记' }), h('p', { text })));
  const go = () => { dismiss(); if (cid) openApp('social', { chat: cid }); else if (moment) openApp('social', { tab: 'moments' }); else if (diary) openApp('diary', { char: diary }); else if (mail) openApp('mail', { mail }); };
  el.addEventListener('click', go);
  $('#banners').append(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const t = setTimeout(dismiss, 4200);
  function dismiss() { clearTimeout(t); el.classList.remove('on'); setTimeout(() => el.remove(), 350); }
}

// 键盘弹出来时把整台手机缩到可见区域（iPhone 上 fixed 元素不会自己让开键盘）
function fitViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const dev = $('#device');
  const apply = () => {
    if (innerWidth >= 620) { dev.style.height = ''; dev.style.top = ''; document.body.classList.remove('kb'); return; }
    dev.style.height = vv.height + 'px';
    dev.style.top = vv.offsetTop + 'px';
    document.body.classList.toggle('kb', innerHeight - vv.height > 120);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}

async function boot() {
  fitViewport();
  await S.boot();
  D.curAccount();
  walls();
  D.on('file', walls);
  buildHome();
  initLock((id, arg) => openApp(id, arg));
  D.on('notify', banner);
  startLife();
  window.__xsj = { S, D, openApp, currentApp };
}
boot().catch((e) => { console.error(e); document.body.append(h('pre', { class: 'fatal', text: '启动失败：' + e.message })); });
