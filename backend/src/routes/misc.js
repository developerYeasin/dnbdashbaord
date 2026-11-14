// Bulletins (daily scheduler), content library, staff, logs, automation and backup
import { Router } from 'express';
import { q, one, json, getSetting, patchSetting, SCHEMA } from '../db.js';
import { h, requireAdmin } from '../auth.js';
import { upload, fileUrl, looksLikeImage } from '../upload.js';
import { runBulletin, BULLETIN_KINDS } from '../services/bulletins.js';
import { tick } from '../services/scheduler.js';
import * as L from '../log.js';

export const bulletins = Router();
bulletins.get('/', h(async (_, res) => res.json({ list: (await q('SELECT * FROM bulletins ORDER BY run_time')).map(b => ({ ...b, channels: json(b.channels) })), kinds: BULLETIN_KINDS })));
const BF = ['name', 'kind', 'run_time', 'active', 'message', 'card_type', 'template_id', 'source_url', 'bg_image', 'auto_publish'];
const bBody = b => {
  const o = {};
  for (const f of BF) if (b[f] !== undefined) o[f] = b[f] === '' && ['template_id', 'source_url', 'bg_image'].includes(f) ? null : b[f];
  if (o.run_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.run_time)) throw Object.assign(new Error('সময় HH:MM (২৪ ঘণ্টা) ফরম্যাটে দিন'), { status: 400 });
  for (const f of ['active', 'auto_publish']) if (o[f] !== undefined) o[f] = o[f] ? 1 : 0;
  if (b.channels !== undefined) o.channels = JSON.stringify(b.channels || []);
  return o;
};
bulletins.post('/', h(async (req, res) => {
  const b = bBody(req.body);
  if (!b.name || !b.run_time) return res.status(400).json({ error: 'নাম ও সময় দিন' });
  const x = await q('INSERT INTO bulletins SET ?', [{ kind: 'custom', ...b }]);
  res.json({ id: x.insertId });
}));
bulletins.put('/:id', h(async (req, res) => { await q('UPDATE bulletins SET ? WHERE id=?', [bBody(req.body), req.params.id]); res.json({ ok: true }); }));
bulletins.delete('/:id', h(async (req, res) => { await q('DELETE FROM bulletins WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
// manual run: preview (no publish) or run+publish
bulletins.post('/:id/run', h(async (req, res) => {
  try {
    res.json(await runBulletin(req.params.id, { force: true, publish: !!req.body?.publish, userId: req.user.id }));
  } catch (e) { res.status(502).json({ error: e.message }); }
}));

// content library (health tips, quotes, history/birthday entries by day)
bulletins.get('/content', h(async (req, res) => res.json(await q('SELECT * FROM content_items WHERE (? IS NULL OR kind=?) ORDER BY id DESC LIMIT 500', [req.query.kind || null, req.query.kind || null]))));
bulletins.post('/content', h(async (req, res) => {
  const { kind, day_month, text } = req.body || {};
  if (!kind || !text) return res.status(400).json({ error: 'ধরন ও লেখা দিন' });
  if (day_month && !/^\d{2}-\d{2}$/.test(day_month)) return res.status(400).json({ error: 'তারিখ DD-MM ফরম্যাটে' });
  await q('INSERT INTO content_items (kind,day_month,text) VALUES (?,?,?)', [kind, day_month || null, text]);
  res.json({ ok: true });
}));
bulletins.delete('/content/:id', h(async (req, res) => { await q('DELETE FROM content_items WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

// ---------- staff ----------
export const staff = Router();
staff.get('/', h(async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  res.json(await q('SELECT * FROM staff WHERE name LIKE ? OR designation LIKE ? OR staff_code LIKE ? ORDER BY id DESC', [s, s, s]));
}));
const SF = ['staff_code', 'name', 'designation', 'department', 'blood_group', 'phone', 'expiry', 'dob'];
const sBody = req => {
  const o = {};
  for (const f of SF) if (req.body[f] !== undefined) o[f] = req.body[f] === '' && ['expiry', 'dob'].includes(f) ? null : String(req.body[f]).trim();
  if (o.blood_group && !/^(A|B|AB|O)[+-]$/.test(o.blood_group)) throw Object.assign(new Error('রক্তের গ্রুপ সঠিক নয় (যেমন B+)'), { status: 400 });
  if (o.phone && !/^\+?[0-9\s-]{6,20}$/.test(o.phone)) throw Object.assign(new Error('মোবাইল নম্বর সঠিক নয়'), { status: 400 });
  if (req.file) { if (!looksLikeImage(req.file)) throw Object.assign(new Error('বৈধ ছবি নয়'), { status: 400 }); o.photo = fileUrl(req.file); }
  return o;
};
const dupMsg = e => (e.code === 'ER_DUP_ENTRY' ? Object.assign(new Error('এই আইডি নম্বর আগেই ব্যবহৃত হয়েছে'), { status: 409 }) : e);
staff.post('/', upload.single('photo'), h(async (req, res) => {
  const o = sBody(req);
  if (!o.name || !o.staff_code) return res.status(400).json({ error: 'নাম ও আইডি নম্বর আবশ্যক' });
  try { const x = await q('INSERT INTO staff SET ?', [o]); await L.info('staff', `কর্মী যোগ: ${o.name} (${o.staff_code})`); res.json({ id: x.insertId }); } catch (e) { throw dupMsg(e); }
}));
staff.put('/:id', upload.single('photo'), h(async (req, res) => {
  try { await q('UPDATE staff SET ? WHERE id=?', [sBody(req), req.params.id]); res.json({ ok: true }); } catch (e) { throw dupMsg(e); }
}));
staff.delete('/:id', requireAdmin, h(async (req, res) => {
  const s = await one('SELECT name FROM staff WHERE id=?', [req.params.id]);
  await q('DELETE FROM staff WHERE id=?', [req.params.id]);
  await L.info('staff', `কর্মী মুছে ফেলা: ${s?.name} — ${req.user.email}`);
  res.json({ ok: true });
}));

// ---------- logs ----------
export const logs = Router();
logs.get('/', h(async (req, res) => {
  const { level, area, from, to, q: s, page = 1 } = req.query;
  const w = [], p = [];
  if (level) { w.push('level=?'); p.push(level); }
  if (area) { w.push('area=?'); p.push(area); }
  if (from) { w.push('created_at >= ?'); p.push(from + ' 00:00:00'); }
  if (to) { w.push('created_at <= ?'); p.push(to + ' 23:59:59'); }
  if (s) { w.push('message LIKE ?'); p.push(`%${s}%`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const rows = await q(`SELECT * FROM logs ${where} ORDER BY id DESC LIMIT 100 OFFSET ?`, [...p, (Math.max(1, Number(page)) - 1) * 100]);
  const total = (await one(`SELECT COUNT(*) c FROM logs ${where}`, p)).c;
  const areas = (await q('SELECT DISTINCT area FROM logs ORDER BY area')).map(r => r.area);
  res.json({ rows, total, areas });
}));
// Admin only; an audit line records who cleared what. Audit (auth/settings) entries are kept.
logs.post('/clear', requireAdmin, h(async (req, res) => {
  const days = Math.max(0, Number(req.body?.olderThanDays ?? 30));
  const x = await q("DELETE FROM logs WHERE area NOT IN ('auth','settings') AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [days]);
  await L.warn('settings', `লগ পরিষ্কার: ${x.affectedRows}টি (${days} দিনের পুরোনো) — ${req.user.email}`);
  res.json({ deleted: x.affectedRows });
}));

// ---------- automation, location, backup ----------
export const admin = Router();
admin.get('/settings', h(async (_, res) => res.json({ automation: await getSetting('automation'), location: await getSetting('location'), public_url: process.env.PUBLIC_URL || '' })));
admin.put('/automation', h(async (req, res) => {
  const allowed = ['enabled', 'news_enabled', 'emergency_stop'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, !!v]));
  await patchSetting('automation', patch);
  await L.warn('settings', `অটোমেশন পরিবর্তন ${JSON.stringify(patch)} — ${req.user.email}`);
  res.json({ ok: true });
}));
admin.put('/location', requireAdmin, h(async (req, res) => {
  const { city, city_bn, country, lat, lon, prayer_method, prayer_school } = req.body || {};
  await patchSetting('location', { city, city_bn, country, lat: Number(lat), lon: Number(lon), prayer_method: Number(prayer_method) || 1, prayer_school: Number(prayer_school ?? 1) });
  res.json({ ok: true });
}));
admin.post('/tick', h(async (_, res) => res.json(await tick('manual'))));

const TABLES = ['app_settings', 'secrets', 'card_templates', 'ads', 'photocards', 'channels', 'publish_jobs', 'bulletins', 'bulletin_runs', 'content_items', 'staff', 'ai_keys', 'news_sources', 'ai_articles', 'users'];
// Full JSON backup. Secrets stay AES-encrypted, so the file is only useful with the same APP_KEY.
admin.get('/backup', requireAdmin, h(async (req, res) => {
  const data = {};
  for (const t of TABLES) data[t] = await q(`SELECT * FROM ${t}`);
  await L.info('settings', `ব্যাকআপ ডাউনলোড — ${req.user.email}`);
  res.set('Content-Disposition', `attachment; filename="dnb-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ version: 1, created: new Date().toISOString(), tables: data });
}));
admin.post('/restore', requireAdmin, h(async (req, res) => {
  const t = req.body?.tables;
  if (!t || typeof t !== 'object') return res.status(400).json({ error: 'অবৈধ ব্যাকআপ ফাইল' });
  const conn = await (await import('../db.js')).pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const name of TABLES) {
      if (!Array.isArray(t[name])) continue;
      await conn.query(`DELETE FROM ${name}`);
      for (const row of t[name]) {
        const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v]));
        await conn.query(`INSERT INTO ${name} SET ?`, [r]);
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
  await L.warn('settings', `ব্যাকআপ থেকে রিস্টোর — ${req.user.email}`);
  res.json({ ok: true });
}));
export const _schema = SCHEMA;
