// 天气：Open-Meteo 的真实天气。选城市（搜名字或用定位），角色也会知道你那边的天气。
import { h, Stack, page, btnIc, sheet, toast } from '../../core/ui.js';
import * as D from '../../core/data.js';
import { getWeather, searchCity, describe, wxIcon } from '../../core/weather.js';
import { hm } from '../../core/time.js';

export function mount(body, { close }) {
  const stack = new Stack(body, close);
  const pg = page({ title: '天气', left: h('span'), right: btnIc('search', () => pickCity(), '换城市') });
  pg.el.classList.add('wx');
  let loading = false;
  async function draw(force = false) {
    const w = D.weatherConf();
    pg.scroll.innerHTML = '';
    if (!w) {
      pg.scroll.append(h('div', { class: 'empty' }, h('b', { text: '还没选城市' }), '选好以后，主屏幕的小组件和角色都会知道你那边的天气。'), h('button', { class: 'btn wide', text: '选城市', onclick: () => pickCity() }));
      return;
    }
    let d = w.cache?.data;
    if (!d || force) {
      if (!d) pg.scroll.append(h('div', { class: 'empty', text: '正在获取…' }));
      if (loading) return;
      loading = true;
      try { d = await getWeather(force); } catch (e) { toast(e.message); } finally { loading = false; }
      if (!d) return;
      pg.scroll.innerHTML = '';
    }
    const cur = d.current, [txt, kind] = describe(cur.weather_code);
    pg.scroll.append(h('div', { class: 'wx-now' },
      h('small', { text: w.name }),
      h('div', { class: 'wx-big' }, h('span', { html: wxIcon(kind, 64) }), h('b', { text: Math.round(cur.temperature_2m) + '°' })),
      h('p', { text: `${txt} · 最高 ${Math.round(d.daily.temperature_2m_max[0])}° 最低 ${Math.round(d.daily.temperature_2m_min[0])}°` }),
      h('div', { class: 'wx-facts' },
        h('div', {}, h('small', { text: '体感' }), h('b', { text: Math.round(cur.apparent_temperature) + '°' })),
        h('div', {}, h('small', { text: '湿度' }), h('b', { text: cur.relative_humidity_2m + '%' })),
        h('div', {}, h('small', { text: '风速' }), h('b', { text: Math.round(cur.wind_speed_10m) + ' km/h' })),
        h('div', {}, h('small', { text: '降水' }), h('b', { text: (d.daily.precipitation_probability_max?.[0] ?? '–') + '%' })))));
    // 接下来 24 小时
    const nowIdx = d.hourly.time.findIndex((t) => new Date(t) >= new Date(Date.now() - 3600000));
    const hours = h('div', { class: 'wx-hours' });
    for (let i = Math.max(0, nowIdx); i < Math.max(0, nowIdx) + 24 && i < d.hourly.time.length; i++) {
      hours.append(h('div', {}, h('small', { text: i === nowIdx ? '现在' : d.hourly.time[i].slice(11, 13) + '时' }), h('span', { html: wxIcon(describe(d.hourly.weather_code[i])[1], 22) }), h('b', { text: Math.round(d.hourly.temperature_2m[i]) + '°' })));
    }
    pg.scroll.append(h('div', { class: 'wx-card' }, h('div', { class: 'wx-card-t', text: '24 小时' }), hours));
    const days = h('div', { class: 'wx-days' });
    for (let i = 0; i < d.daily.time.length; i++) {
      const t = new Date(d.daily.time[i] + 'T12:00:00');
      days.append(h('div', { class: 'wx-day' },
        h('b', { text: i ? '周' + '日一二三四五六'[t.getDay()] : '今天' }),
        h('span', { html: wxIcon(describe(d.daily.weather_code[i])[1], 22) }),
        h('small', { text: describe(d.daily.weather_code[i])[0] }),
        h('em', { text: `${Math.round(d.daily.temperature_2m_min[i])}° / ${Math.round(d.daily.temperature_2m_max[i])}°` })));
    }
    pg.scroll.append(h('div', { class: 'wx-card' }, h('div', { class: 'wx-card-t', text: '7 天' }), days),
      h('p', { class: 'wx-src' }, `更新于 ${hm(w.cache?.at || Date.now())} · 天气数据：`, h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener', text: 'Open-Meteo.com' })),
      h('button', { class: 'btn wide ghost', text: '刷新', onclick: () => draw(true) }));
  }

  function pickCity() {
    const inp = h('input', { class: 'dlg-in', placeholder: '城市名，比如：上海、London', type: 'search' });
    const res = h('div', { class: 'pick-list' });
    const s = sheet({ title: '选城市', full: true, body: h('div', {},
      h('div', { class: 'wx-search' }, inp, h('button', { class: 'btn', text: '搜', onclick: go })),
      h('button', { class: 'btn wide ghost', text: '用现在的位置', onclick: locate }),
      res) });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => inp.focus(), 300);
    async function go() {
      const q = inp.value.trim();
      if (!q) return;
      res.innerHTML = '';
      res.append(h('div', { class: 'empty', text: '查找中…' }));
      try {
        const list = await searchCity(q);
        res.innerHTML = '';
        if (!list.length) res.append(h('div', { class: 'empty', text: '没找到，换个写法试试' }));
        for (const c of list) res.append(h('button', { class: 'pick-it', onclick: () => choose(c) }, h('span', {}, h('b', { text: c.name }), h('small', { text: c.region }))));
      } catch { res.innerHTML = ''; res.append(h('div', { class: 'empty', text: '查不到，检查一下网络' })); }
    }
    function locate() {
      if (!navigator.geolocation) { toast('这台设备不能定位'); return; }
      toast('正在定位…');
      navigator.geolocation.getCurrentPosition((p) => choose({ name: '当前位置', lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
        () => toast('没拿到位置：可能没给权限'), { timeout: 12000, maximumAge: 600000 });
    }
    function choose(c) { s.close(); D.setWeatherConf({ name: c.name, lat: c.lat, lon: c.lon }); draw(true); }
  }

  const off = D.on('weather', () => {});
  stack.root({ el: pg.el });
  draw();
  return { destroy: () => { off(); stack.destroyAll(); } };
}
