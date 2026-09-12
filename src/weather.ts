import type { City } from './types';
const coordinates = { zhuhai: [22.27, 113.58], beijing: [39.90, 116.41] };
const cache = new Map<City, { text: string; until: number }>();
function describe(code: number): string {
  if (code === 0) return '晴';
  if (code <= 3) return '多云';
  if (code <= 48) return '有雾';
  if (code <= 67) return '有雨';
  if (code <= 77) return '有雪';
  if (code <= 82) return '阵雨';
  if (code <= 86) return '阵雪';
  return '雷雨';
}
export async function weather(city: City): Promise<string> {
  const saved = cache.get(city);
  if (saved && saved.until > Date.now()) return saved.text;
  const [latitude, longitude] = coordinates[city];
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=Asia%2FShanghai`, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error();
    const { current } = await response.json();
    if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) throw new Error();
    const value = `${describe(current.weather_code)} · ${Math.round(current.temperature_2m)}°C`;
    cache.set(city, { text: value, until: Date.now() + 30 * 60000 });
    return value;
  } catch {
    const value = saved ? `${saved.text}（缓存）` : '天气暂不可用';
    cache.set(city, { text: value.replaceAll('（缓存）（缓存）', '（缓存）'), until: Date.now() + 5 * 60000 });
    return value;
  }
}
