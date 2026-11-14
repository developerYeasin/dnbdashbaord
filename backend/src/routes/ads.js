import { Router } from 'express';
import { q, one, getSetting, setSetting } from '../db.js';
import { h } from '../auth.js';
import { upload, fileUrl, looksLikeImage } from '../upload.js';
import { activeAds } from '../services/ads.js';
import { assertPublicUrl } from '../services/http.js';
import * as L from '../log.js';

const r = Router();
r.get('/', h(async (_, res) => {
  const [all, act, cyc] = await Promise.all([q('SELECT * FROM ads ORDER BY sort_order, id'), activeAds(), getSetting('ad_cycle', {})]);
  const next = Object.fromEntries(['main', 'text', 'opening'].map(k => [k, act.length ? act[(cyc[k] || 0) % act.length].id : null]));
  res.json({ ads: all, next, activeIds: act.map(a => a.id) });
}));

const FIELDS = ['name', 'organization', 'description', 'contact', 'link', 'active', 'sort_order', 'start_date', 'end_date'];
async function body(req) {
  const b = {};
  for (const f of FIELDS) if (req.body[f] !== undefined) b[f] = req.body[f] === '' && /date|sort/.test(f) ? null : req.body[f];
  if (b.active !== undefined) b.active = ['1', 'true', 1, true].includes(b.active) ? 1 : 0;
  if (req.file) {
    if (!looksLikeImage(req.file)) throw Object.assign(new Error('বৈধ ছবি নয়'), { status: 400 });
    b.image = fileUrl(req.file);
  } else if (req.body.image_url) {
    await assertPublicUrl(req.body.image_url);
    b.image = req.body.image_url;
  }
  return b;
}
r.post('/', upload.single('file'), h(async (req, res) => {
  const b = await body(req);
  if (!b.image) return res.status(400).json({ error: 'ব্যানার ছবি বা বৈধ URL দিন' });
  if (!b.name) return res.status(400).json({ error: 'বিজ্ঞাপনের নাম দিন' });
  if (b.sort_order == null) b.sort_order = ((await one('SELECT MAX(sort_order) m FROM ads')).m || 0) + 1;
  const x = await q('INSERT INTO ads SET ?', [b]);
  await L.info('ads', `বিজ্ঞাপন যোগ: ${b.name} — ${req.user.email}`);
  res.json({ id: x.insertId });
}));
r.put('/:id', upload.single('file'), h(async (req, res) => {
  const b = await body(req);
  if (Object.keys(b).length) await q('UPDATE ads SET ? WHERE id=?', [b, req.params.id]);
  await L.info('ads', `বিজ্ঞাপন সম্পাদনা #${req.params.id} — ${req.user.email}`);
  res.json({ ok: true });
}));
r.post('/:id/default', h(async (req, res) => { await q('UPDATE ads SET is_default=(id=?)', [req.params.id]); res.json({ ok: true }); }));
r.post('/reorder', h(async (req, res) => {
  let i = 0;
  for (const id of req.body.ids || []) await q('UPDATE ads SET sort_order=? WHERE id=?', [++i, id]);
  res.json({ ok: true });
}));
// Manual override: make a given ad (or the next one) come up next for a card kind
r.post('/cycle', h(async (req, res) => {
  const { kind, adId, step } = req.body || {};
  const act = await activeAds();
  const cyc = await getSetting('ad_cycle', {});
  if (!act.length) return res.status(400).json({ error: 'সক্রিয় বিজ্ঞাপন নেই' });
  const cur = cyc[kind] || 0;
  if (adId) {
    const idx = act.findIndex(a => a.id === Number(adId));
    if (idx < 0) return res.status(400).json({ error: 'বিজ্ঞাপনটি সক্রিয় নয়' });
    cyc[kind] = cur - (cur % act.length) + idx;
  } else cyc[kind] = cur + (Number(step) || 1);
  await setSetting('ad_cycle', cyc);
  res.json({ ok: true });
}));
r.delete('/:id', h(async (req, res) => {
  const a = await one('SELECT name FROM ads WHERE id=?', [req.params.id]);
  await q('DELETE FROM ads WHERE id=?', [req.params.id]);
  await L.info('ads', `বিজ্ঞাপন মুছে ফেলা: ${a?.name} — ${req.user.email}`);
  res.json({ ok: true });
}));
export default r;
