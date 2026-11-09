// App 清单：加一个 App = 在这里加一行 + 建 js/apps/<id>/index.js（导出 mount）+ 在 icons.js 画图标
export const APPS = [
  { id: 'social', name: '社交', load: () => import('../apps/social/index.js') },
  { id: 'offline', name: '线下', load: () => import('../apps/offline/index.js') },
  { id: 'diary', name: '日记', load: () => import('../apps/diary/index.js') },
  { id: 'memo', name: '备忘录', load: () => import('../apps/memo/index.js') },
  { id: 'calendar', name: '日历', load: () => import('../apps/calendar/index.js') },
  { id: 'mail', name: '邮箱', load: () => import('../apps/mail/index.js') },
  { id: 'read', name: '阅读', load: () => import('../apps/read/index.js') },
  { id: 'album', name: '相册', load: () => import('../apps/album/index.js') },
  { id: 'weather', name: '天气', load: () => import('../apps/weather/index.js') },
  { id: 'settings', name: '设置', load: () => import('../apps/settings/index.js') },
];
export const appById = (id) => APPS.find((a) => a.id === id);
