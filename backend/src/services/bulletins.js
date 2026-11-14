// Daily bulletins. Data comes from real sources only:
// weather = Open-Meteo, prayer/sehri/iftar = Aladhan, history = Wikimedia "On this day",
// top-10 = today's WordPress posts, health/good-morning/birthday = your own content library or staff DOBs.
// When a source has nothing for today, the run is marked "skipped" and nothing is published.
import { q, one, json, getSetting } from '../db.js';
import { httpJson } from './http.js';
import { createCard, enqueue, defaultTemplate } from './publisher.js';
import { listPosts } from './wordpress.js';
import * as L from '../log.js';

const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const dhakaNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
export const todayDhaka = () => { const d = dhakaNow(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hm = t => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${bn(((h + 11) % 12) + 1)}:${bn(String(m).padStart(2, '0'))} ${ap === 'AM' ? 'পূর্বাহ্ণ' : 'অপরাহ্ণ'}`; };

const WMO = { 0: 'পরিষ্কার আকাশ', 1: 'প্রায় পরিষ্কার', 2: 'আংশিক মেঘলা', 3: 'মেঘাচ্ছন্ন', 45: 'কুয়াশা', 48: 'ঘন কুয়াশা', 51: 'হালকা গুঁড়ি বৃষ্টি', 53: 'গুঁড়ি বৃষ্টি', 55: 'ভারী গুঁড়ি বৃষ্টি', 61: 'হালকা বৃষ্টি', 63: 'মাঝারি বৃষ্টি', 65: 'ভারী বৃষ্টি', 80: 'বিক্ষিপ্ত বৃষ্টি', 81: 'বৃষ্টির ঝাপটা', 82: 'প্রবল বর্ষণ', 95: 'বজ্রসহ বৃষ্টি', 96: 'বজ্রঝড় ও শিলাবৃষ্টি', 99: 'প্রবল বজ্রঝড়' };

async function weather(loc) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max,wind_speed_10m_max&timezone=Asia%2FDhaka&forecast_days=1`;
  return (await httpJson(u)).data;
}

const BUILDERS = {
  async good_morning(b) {
    const it = await one("SELECT text FROM content_items WHERE kind='good_morning' ORDER BY RAND() LIMIT 1");
    return { category: 'শুভ সকাল', text: it?.text || b.message };
  },
  async weather(b, loc) {
    const w = await weather(loc), d = w.daily;
    return {
      category: `আজকের আবহাওয়া · ${loc.city_bn || loc.city}`,
      text: `${WMO[d.weather_code[0]] || ''}\nসর্বোচ্চ ${bn(Math.round(d.temperature_2m_max[0]))}° · সর্বনিম্ন ${bn(Math.round(d.temperature_2m_min[0]))}°\nবৃষ্টির সম্ভাবনা ${bn(d.precipitation_probability_max[0] ?? 0)}%`,
    };
  },
  async temperature(b, loc) {
    const c = (await weather(loc)).current;
    return { category: `এই মুহূর্তে · ${loc.city_bn || loc.city}`, text: `তাপমাত্রা ${bn(Math.round(c.temperature_2m))}°সে\nআর্দ্রতা ${bn(c.relative_humidity_2m)}%\nবাতাস ${bn(Math.round(c.wind_speed_10m))} কিমি/ঘণ্টা` };
  },
  async weather_alert(b, loc) {
    const w = await weather(loc), d = w.daily, risks = [];
    if (d.temperature_2m_max[0] >= 36) risks.push(`তাপপ্রবাহের ঝুঁকি (${bn(Math.round(d.temperature_2m_max[0]))}°)`);
    if ((d.precipitation_probability_max[0] ?? 0) >= 70) risks.push('ভারী বৃষ্টির সম্ভাবনা');
    if (d.wind_speed_10m_max[0] >= 40) risks.push('ঝোড়ো হাওয়া');
    if ([95, 96, 99].includes(d.weather_code[0])) risks.push('বজ্রঝড়');
    if (d.uv_index_max[0] >= 8) risks.push('অতিবেগুনি রশ্মি অত্যন্ত বেশি');
    if (b.message) risks.push(b.message); // official alert text entered by the desk (e.g. from BMD)
    if (!risks.length) return null;
    return { category: 'আবহাওয়া সতর্কতা', text: risks.join('\n') + '\n(সূত্র: Open-Meteo পূর্বাভাস)' };
  },
  async prayer(b, loc) {
    const d = todayDhaka().split('-').reverse().join('-');
    const { data } = await httpJson(`https://api.aladhan.com/v1/timingsByCity/${d}?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=${loc.prayer_method || 1}&school=${loc.prayer_school ?? 1}`);
    const t = data.data.timings;
    return { category: `নামাজের সময়সূচি · ${loc.city_bn || loc.city}`, text: `ফজর ${hm(t.Fajr)}\nযোহর ${hm(t.Dhuhr)}\nআসর ${hm(t.Asr)}\nমাগরিব ${hm(t.Maghrib)}\nএশা ${hm(t.Isha)}`, textSize: 70 };
  },
  async ramadan(b, loc) {
    const d = todayDhaka().split('-').reverse().join('-');
    const { data } = await httpJson(`https://api.aladhan.com/v1/timingsByCity/${d}?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=${loc.prayer_method || 1}&school=${loc.prayer_school ?? 1}`);
    const t = data.data.timings, hij = data.data.date.hijri;
    if (hij.month.number !== 9 && !b.message?.includes('force')) return null;
    return { category: `রমজান ${bn(hij.day)} · ${loc.city_bn || loc.city}`, text: `সেহরির শেষ সময় ${hm(t.Imsak)}\nইফতার ${hm(t.Maghrib)}` };
  },
  async health() {
    const it = await one("SELECT text FROM content_items WHERE kind='health' ORDER BY RAND() LIMIT 1");
    return it ? { category: 'দৈনিক স্বাস্থ্য বুলেটিন', text: it.text } : null;
  },
  async history() {
    const [y, m, d] = todayDhaka().split('-');
    const own = await q("SELECT text FROM content_items WHERE kind='history' AND day_month=?", [`${d}-${m}`]);
    if (own.length) return { category: 'ইতিহাসে আজকের দিন', text: own.map(r => r.text).slice(0, 4).join('\n'), textSize: 56 };
    for (const lang of ['bn', 'en']) {
      try {
        const { data } = await httpJson(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/selected/${m}/${d}`);
        const ev = (data.selected || []).slice(0, 3);
        if (ev.length) return { category: 'ইতিহাসে আজকের দিন', text: ev.map(e => `${bn(e.year)}: ${e.text}`).join('\n'), textSize: 52, note: lang === 'en' ? 'ইংরেজি উইকিপিডিয়া থেকে' : '' };
      } catch { /* try next */ }
    }
    return null;
  },
  async birthday() {
    const [, m, d] = todayDhaka().split('-');
    const staff = await q("SELECT name, designation FROM staff WHERE dob IS NOT NULL AND DATE_FORMAT(dob,'%m-%d')=?", [`${m}-${d}`]);
    const own = await q("SELECT text FROM content_items WHERE kind='birthday' AND day_month=?", [`${d}-${m}`]);
    const lines = [...staff.map(s => `${s.name} (${s.designation})-কে জন্মদিনের শুভেচ্ছা`), ...own.map(r => r.text)];
    return lines.length ? { category: 'জন্মবার্ষিকী ও শ্রদ্ধাঞ্জলি', text: lines.join('\n') } : null;
  },
  async top10() {
    const day = todayDhaka();
    const { posts } = await listPosts({ page: 1, perPage: 10, after: `${day}T00:00:00`, before: `${day}T23:59:59` });
    if (!posts.length) return null;
    return { category: 'আজকের সেরা ১০ সংবাদ', text: posts.map((p, i) => `${bn(i + 1)}. ${p.title}`).join('\n'), textSize: 44, textAlign: 'left', textMargin: 120 };
  },
  async custom(b) {
    if (b.source_url) {
      const { data } = await httpJson(b.source_url);
      const text = typeof data === 'string' ? data : data.text || data.message || JSON.stringify(data).slice(0, 400);
      return { category: b.name, text };
    }
    return b.message ? { category: b.name, text: b.message } : null;
  },
};
export const BULLETIN_KINDS = Object.keys(BUILDERS);

// Runs one bulletin. `force` = manual "এখনই চালান" (bypasses the once-per-day guard).
export async function runBulletin(id, { force = false, publish = null, userId = null } = {}) {
  const b = await one('SELECT * FROM bulletins WHERE id=?', [id]);
  if (!b) throw new Error('শিডিউল পাওয়া যায়নি');
  const day = todayDhaka();
  if (!force) {
    // Claim today's slot first: the PRIMARY KEY makes a second runner fail here instead of double-posting
    const claim = await q("INSERT IGNORE INTO bulletin_runs (bulletin_id, run_date, status) VALUES (?,?, 'running')", [b.id, day]);
    if (!claim.affectedRows) return { skipped: true, reason: 'আজ ইতিমধ্যে চালানো হয়েছে' };
  }
  const finish = async (status, result, cardId = null) => {
    await q('UPDATE bulletins SET last_run_at=NOW(), last_status=?, last_result=?, last_card_id=? WHERE id=?', [status, result, cardId, b.id]);
    if (!force) await q('UPDATE bulletin_runs SET status=?, photocard_id=? WHERE bulletin_id=? AND run_date=?', [status, cardId, b.id, day]);
  };
  try {
    const loc = await getSetting('location', {});
    const build = BUILDERS[b.kind] || BUILDERS.custom;
    const content = await build(b, loc);
    if (!content?.text) {
      await finish('skipped', 'আজকের জন্য কোনো যাচাইকৃত তথ্য পাওয়া যায়নি');
      await L.info('scheduler', `${b.name}: তথ্য নেই — বাদ দেওয়া হলো`);
      return { skipped: true, reason: 'তথ্য নেই' };
    }
    const tpl = b.template_id ? await one('SELECT * FROM card_templates WHERE id=?', [b.template_id]) : await defaultTemplate('text');
    const settings = { ...(json(tpl?.settings) || {}), category: content.category, text: content.text };
    for (const k of ['textSize', 'textAlign', 'textMargin']) if (content[k]) settings[k] = content[k];
    const { card } = await createCard({
      kind: 'text', settings, bg: b.card_type === 'image' ? b.bg_image : null, title: content.category, templateId: tpl?.id,
      origin: 'schedule', uniq: force ? null : `bulletin:${b.id}:${day}`, userId,
    });
    let queued = 0;
    const doPublish = publish ?? !!b.auto_publish;
    if (doPublish) queued = await enqueue(card.id, { purpose: 'schedule', channelIds: json(b.channels), caption: `${content.category}\n\n${content.text}` });
    const msg = `কার্ড #${card.id} তৈরি${doPublish ? `, ${queued}টি প্ল্যাটফর্মে সারিতে` : ' (প্রকাশ বন্ধ)'}${content.note ? ' · ' + content.note : ''}`;
    await finish('ok', msg, card.id);
    await L.success('scheduler', `${b.name}: ${msg}`);
    return { ok: true, card, queued };
  } catch (e) {
    await finish('failed', e.message);
    if (!force) await q('DELETE FROM bulletin_runs WHERE bulletin_id=? AND run_date=?', [b.id, day]); // allow retry
    await L.error('scheduler', `${b.name} ব্যর্থ: ${e.message}`);
    throw e;
  }
}

// Called every minute: runs bulletins whose time (HH:MM, Asia/Dhaka) has passed today and not yet run.
export async function dueBulletins() {
  const now = dhakaNow();
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const list = await q(`SELECT b.id, b.run_time FROM bulletins b LEFT JOIN bulletin_runs r ON r.bulletin_id=b.id AND r.run_date=?
    WHERE b.active=1 AND r.bulletin_id IS NULL AND b.run_time <= ?`, [todayDhaka(), cur]);
  for (const b of list) {
    // only catch up within 60 minutes, so a server that was down at 06:00 does not post "good morning" at 21:00
    const [h, m] = b.run_time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) > 60) continue;
    await runBulletin(b.id).catch(() => {});
  }
}
