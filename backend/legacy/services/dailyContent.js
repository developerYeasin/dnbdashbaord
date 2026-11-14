import { q, getSettings } from '../db.js';
import { toBn } from './photocard.js';

const WEATHER_CODES = {
  0: 'পরিষ্কার আকাশ', 1: 'প্রায় পরিষ্কার', 2: 'আংশিক মেঘলা', 3: 'মেঘাচ্ছন্ন', 45: 'কুয়াশা', 48: 'ঘন কুয়াশা',
  51: 'হালকা গুঁড়িগুঁড়ি বৃষ্টি', 53: 'গুঁড়িগুঁড়ি বৃষ্টি', 55: 'ঘন গুঁড়িগুঁড়ি বৃষ্টি', 61: 'হালকা বৃষ্টি', 63: 'মাঝারি বৃষ্টি',
  65: 'ভারী বৃষ্টি', 80: 'বিক্ষিপ্ত বৃষ্টি', 81: 'বৃষ্টি', 82: 'প্রবল বৃষ্টি', 95: 'বজ্রসহ বৃষ্টি', 96: 'বজ্রঝড় ও শিলাবৃষ্টি', 99: 'প্রবল বজ্রঝড়',
};

const mmdd = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function fromLibrary(kind) {
  const today = await q('SELECT * FROM content_library WHERE kind=? AND day_month=? ORDER BY RAND()', [kind, mmdd()]);
  if (today.length) return today;
  return q('SELECT * FROM content_library WHERE kind=? AND (day_month IS NULL OR day_month="") ORDER BY RAND() LIMIT 1', [kind]);
}

async function weather(noon) {
  const s = await getSettings();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.latitude}&longitude=${s.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=Asia%2FDhaka&forecast_days=1`;
  const d = await (await fetch(url)).json();
  const c = d.current, dl = d.daily;
  const lines = [
    `অবস্থা: ${WEATHER_CODES[c.weather_code] || '—'}`,
    `বর্তমান তাপমাত্রা: ${toBn(Math.round(c.temperature_2m))}°সে.`,
    `সর্বোচ্চ ${toBn(Math.round(dl.temperature_2m_max[0]))}°  ·  সর্বনিম্ন ${toBn(Math.round(dl.temperature_2m_min[0]))}°`,
    `আর্দ্রতা: ${toBn(c.relative_humidity_2m)}%  ·  বাতাস: ${toBn(Math.round(c.wind_speed_10m))} কিমি/ঘ`,
    `বৃষ্টির সম্ভাবনা: ${toBn(dl.precipitation_probability_max[0] ?? 0)}%`,
  ];
  if (!noon) lines.push(`সূর্যোদয় ${toBn(dl.sunrise[0].slice(11))}  ·  সূর্যাস্ত ${toBn(dl.sunset[0].slice(11))}`);
  // manual govt / emergency alert for today (content_library kind=weather_alert)
  const alert = await fromLibrary('weather_alert');
  if (alert[0]) lines.push(`⚠ ${alert[0].text}`);
  return { mode: 'list', heading: `${noon ? 'দুপুরের' : 'আজকের'} আবহাওয়া · ${s.city}`, title: `${s.city} আবহাওয়া`, lines };
}

async function prayer() {
  const s = await getSettings();
  const d = await (await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(s.city)}&country=${encodeURIComponent(s.country)}&method=1&school=1`)).json();
  const t = d.data.timings;
  return {
    mode: 'list',
    heading: `নামাজের সময়সূচি · ${s.city}`,
    title: 'আজকের নামাজের সময়সূচি',
    lines: [
      `ফজর: ${toBn(t.Fajr)}`, `সূর্যোদয়: ${toBn(t.Sunrise)}`, `যোহর: ${toBn(t.Dhuhr)}`,
      `আসর: ${toBn(t.Asr)}`, `মাগরিব: ${toBn(t.Maghrib)}`, `এশা: ${toBn(t.Isha)}`,
    ],
  };
}

async function topNews() {
  const rows = await q(`SELECT title FROM posts WHERE source='wordpress' AND created_at >= NOW() - INTERVAL 1 DAY ORDER BY id DESC LIMIT 10`);
  if (!rows.length) return null;
  return { mode: 'list', heading: 'আজকের টপটেন', title: 'আজকের গুরুত্বপূর্ণ সংবাদ', lines: rows.map(r => r.title) };
}

async function libraryCard(kind, heading, fallback) {
  const rows = await fromLibrary(kind);
  if (!rows.length) return fallback ? { mode: 'text', heading, title: fallback } : null;
  if (rows.length > 1) return { mode: 'list', heading, title: heading, lines: rows.slice(0, 8).map(r => r.title ? `${r.title} — ${r.text}` : r.text) };
  return { mode: 'text', heading, title: rows[0].title ? `${rows[0].title}\n${rows[0].text}` : rows[0].text, image: rows[0].image };
}

/** Returns card params for a schedule kind, or null if nothing to post */
export async function buildDaily(kind, title) {
  switch (kind) {
    case 'good_morning': return libraryCard('good_morning', title || 'শুভ সকাল', 'শুভ সকাল ☀\nআপনার দিনটি শুভ হোক');
    case 'weather': return weather(false);
    case 'weather_noon': return weather(true);
    case 'prayer': return prayer();
    case 'health': return libraryCard('health', title || 'স্বাস্থ্য বুলেটিন');
    case 'history': return libraryCard('history', title || 'ইতিহাসে আজকের দিন');
    case 'birthday': return libraryCard('birthday', title || 'জন্মদিনের শুভেচ্ছা');
    case 'top_news': return topNews();
    default: return libraryCard(kind, title);
  }
}
