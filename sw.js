// 整版缓存：一个版本的所有文件一起存、一起换，不会一半新一半旧（推了新版以后手机上 50 多个文件可能一半是旧的）；没网也能打开壳子。
// 新版怎么换（main.js 的 initSW）：打开时浏览器自己去看 sw.js 变没变 → 变了就在后台把新版整版下好 →
// 要是还在锁屏上（刚打开 15 秒内），马上换、整页重新载入一下；已经在用了就等下次打开。
// 下面 VERSION 和 FILES 是 tests/stamp.py 按文件内容算出来写的，推之前跑一下（测试脚本也会自动跑），别手改。
// <stamp>
const VERSION = '05262baae4';
const FILES = [
  'index.html',
  'manifest.webmanifest',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon.svg',
  'css/apps.css',
  'css/base.css',
  'css/phone.css',
  'css/read.css',
  'css/social.css',
  'js/main.js',
  'js/apps/shared.js',
  'js/apps/album/index.js',
  'js/apps/calendar/index.js',
  'js/apps/diary/index.js',
  'js/apps/game/index.js',
  'js/apps/mail/index.js',
  'js/apps/memo/index.js',
  'js/apps/offline/index.js',
  'js/apps/read/index.js',
  'js/apps/settings/index.js',
  'js/apps/social/char.js',
  'js/apps/social/chat.js',
  'js/apps/social/index.js',
  'js/apps/social/list.js',
  'js/apps/social/me.js',
  'js/apps/social/moments.js',
  'js/apps/social/stickers.js',
  'js/apps/tarot/index.js',
  'js/apps/weather/index.js',
  'js/core/api.js',
  'js/core/chat.js',
  'js/core/context.js',
  'js/core/crop.js',
  'js/core/data.js',
  'js/core/game.js',
  'js/core/life.js',
  'js/core/mail.js',
  'js/core/parse.js',
  'js/core/prompt.js',
  'js/core/read.js',
  'js/core/search.js',
  'js/core/store.js',
  'js/core/tarot.js',
  'js/core/time.js',
  'js/core/ui.js',
  'js/core/weather.js',
  'js/phone/apps.js',
  'js/phone/home.js',
  'js/phone/icons.js',
  'js/phone/lock.js',
  'js/phone/widgets.js',
  'js/phone/window.js'
];
// </stamp>
const CACHE = 'xsj-' + VERSION;
const ROOT = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('xsj-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
// 页面说「换」才换（在锁屏上的时候）
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 接口、天气、搜索这些别的网站的请求不管
  if (url.origin !== location.origin || !url.pathname.startsWith(ROOT)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = req.mode === 'navigate' ? await c.match('index.html') : await c.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
