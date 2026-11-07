// 天气：Open-Meteo（不要 Key，网页能直接调）。显示天气的地方要标「天气数据：Open-Meteo.com」
import { weatherConf, setWeatherConf } from './data.js';

const FC = 'https://api.open-meteo.com/v1/forecast';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FRESH = 30 * 60 * 1000;

// WMO 天气代码 → [文字, 图标类型]
const CODES = {
  0: ['晴', 'sun'], 1: ['大致晴朗', 'sun'], 2: ['多云', 'partly'], 3: ['阴', 'cloud'],
  45: ['雾', 'fog'], 48: ['雾凇', 'fog'],
  51: ['小毛毛雨', 'drizzle'], 53: ['毛毛雨', 'drizzle'], 55: ['大毛毛雨', 'drizzle'], 56: ['冻毛毛雨', 'drizzle'], 57: ['冻毛毛雨', 'drizzle'],
  61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'], 66: ['冻雨', 'rain'], 67: ['冻雨', 'rain'],
  71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['雪粒', 'snow'],
  80: ['阵雨', 'rain'], 81: ['阵雨', 'rain'], 82: ['强阵雨', 'rain'], 85: ['阵雪', 'snow'], 86: ['强阵雪', 'snow'],
  95: ['雷阵雨', 'storm'], 96: ['雷阵雨伴冰雹', 'storm'], 99: ['强雷阵雨伴冰雹', 'storm'],
};
export const describe = (code) => CODES[code] || ['未知', 'cloud'];

export async function searchCity(name) {
  const r = await fetch(`${GEO}?name=${encodeURIComponent(name)}&count=8&language=zh&format=json`);
  if (!r.ok) throw new Error('查不到');
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: x.name, region: [x.admin1, x.country].filter(Boolean).join(' · '), lat: x.latitude, lon: x.longitude }));
}

let inflight = null;
/** 拿天气（30 分钟内的用缓存）。没设地点返回 null */
export async function getWeather(force = false) {
  const w = weatherConf();
  if (!w) return null;
  if (!force && w.cache && Date.now() - w.cache.at < FRESH) return w.cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const q = new URLSearchParams({
      latitude: w.lat, longitude: w.lon, timezone: 'auto', forecast_days: 7,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      hourly: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    });
    const r = await fetch(`${FC}?${q}`);
    if (!r.ok) throw new Error('天气服务暂时连不上');
    const data = await r.json();
    setWeatherConf({ ...weatherConf(), cache: { at: Date.now(), data } });
    return data;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** 缓存里的天气（不联网），给提示词和小组件用 */
export function cached() { return weatherConf()?.cache?.data || null; }

/** 一句话天气：「上海 多云 18°C，今天 14～20°C」 */
export function weatherLine() {
  const w = weatherConf(), d = cached();
  if (!w || !d?.current) return '';
  const [txt] = describe(d.current.weather_code);
  const t = Math.round(d.current.temperature_2m);
  const lo = d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null, hi = d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null;
  return `${w.name} ${txt} ${t}°C${lo != null ? `，今天 ${lo}～${hi}°C` : ''}`;
}

/** 天气小图标（黑白线条） */
export function wxIcon(kind, size = 28) {
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>';
  const cloud = '<path d="M7.4 18.4h9.4a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.3 3 3 0 0 0 .3 5.9z"/>';
  const P = {
    sun,
    partly: '<circle cx="9" cy="8.6" r="3.2"/><path d="M9 2.8v1.4M3.2 8.6h1.4M4.9 4.5l1 1M13.1 4.5l-1 1"/><path d="M8.4 19h8.8a3.2 3.2 0 0 0 .2-6.4 4.6 4.6 0 0 0-8.8 1.1 2.7 2.7 0 0 0-.2 5.3z" fill="var(--wx-fill,#fff)"/>',
    cloud,
    fog: '<path d="M7.4 13.4h9.4a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.3 3 3 0 0 0 .3 5.9z"/><path d="M5 17h14M7 20h10"/>',
    drizzle: cloud.replace('18.4', '15.4').replace('7.2', '7.2') + '<path d="M9 19.6v.4M13 19.6v.4M17 19.6v.4"/>',
    rain: '<path d="M7.4 15h9.4a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.3 3 3 0 0 0 .3 5.9z"/><path d="m9 17.6-1 2.6M13 17.6l-1 2.6M17 17.6l-1 2.6"/>',
    snow: '<path d="M7.4 15h9.4a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.3 3 3 0 0 0 .3 5.9z"/><path d="M8.6 19h.1M12.6 20.4h.1M16.6 19h.1" stroke-width="2.4"/>',
    storm: '<path d="M7.4 15h9.4a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.3 3 3 0 0 0 .3 5.9z"/><path d="m12.6 15.6-2 3.4h3l-2 3"/>',
  };
  return `<svg class="wxi" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[kind] || cloud}</svg>`;
}
