import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { q, one, json } from '../db.js';
import { h } from '../auth.js';
import { upload, memUpload, fileUrl, looksLikeImage, saveBuffer } from '../upload.js';
import { createCard, enqueue } from '../services/publisher.js';
import { peekAd, takeAd } from '../services/ads.js';
import { http, assertPublicUrl } from '../services/http.js';
import { removeBackground } from '../services/ai.js';
import * as L from '../log.js';

const r = Router();
const KINDS = ['main', 'text', 'opening', 'idcard'];

// ---------- templates ----------
r.get('/templates', h(async (req, res) => {
  const k = req.query.kind || null;
  const rows = await q('SELECT * FROM card_templates WHERE (? IS NULL OR kind=?) ORDER BY kind, is_default DESC, id', [k, k]);
  res.json(rows.map(t => ({ ...t, settings: json(t.settings) || {} })));
}));
r.post('/templates', h(async (req, res) => {
  const { kind, name, settings } = req.body || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'অবৈধ ধরন' });
  const x = await q('INSERT INTO card_templates (kind,name,settings) VALUES (?,?,?)', [kind, name || 'নতুন টেমপ্লেট', JSON.stringify(settings || {})]);
  await L.info('template', `টেমপ্লেট তৈরি: ${name} (${kind}) — ${req.user.email}`);
  res.json({ id: x.insertId });
}));
r.put('/templates/:id', h(async (req, res) => {
  const { name, settings } = req.body || {};
  await q('UPDATE card_templates SET name=COALESCE(?,name), settings=COALESCE(?,settings) WHERE id=?', [name ?? null, settings ? JSON.stringify(settings) : null, req.params.id]);
  res.json({ ok: true });
}));
r.post('/templates/:id/duplicate', h(async (req, res) => {
  const t = await one('SELECT * FROM card_templates WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'টেমপ্লেট নেই' });
  const x = await q('INSERT INTO card_templates (kind,name,settings) VALUES (?,?,?)', [t.kind, `${t.name} (কপি)`, JSON.stringify(json(t.settings) || {})]);
  res.json({ id: x.insertId });
}));
r.post('/templates/:id/default', h(async (req, res) => {
  const t = await one('SELECT kind FROM card_templates WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'টেমপ্লেট নেই' });
  await q('UPDATE card_templates SET is_default=(id=?) WHERE kind=?', [req.params.id, t.kind]);
  res.json({ ok: true });
}));
r.delete('/templates/:id', h(async (req, res) => {
  const t = await one('SELECT * FROM card_templates WHERE id=?', [req.params.id]);
  if (t?.is_default) return res.status(400).json({ error: 'ডিফল্ট টেমপ্লেট মোছা যাবে না — আগে অন্যটিকে ডিফল্ট করুন' });
  await q('DELETE FROM card_templates WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// next ad in the cycle for a card kind (preview only, does not advance)
r.get('/next-ad/:kind', h(async (req, res) => res.json(await peekAd(req.params.kind))));

// ---------- saved cards ----------
r.get('/', h(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const k = req.query.kind || null;
  const rows = await q(`SELECT c.*, a.name ad_name,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',j.id,'status',j.status,'platform',ch.platform,'name',ch.name,'error',j.error,'remote_id',j.remote_id))
       FROM publish_jobs j JOIN channels ch ON ch.id=j.channel_id WHERE j.photocard_id=c.id) jobs
    FROM photocards c LEFT JOIN ads a ON a.id=c.ad_id WHERE (? IS NULL OR c.kind=?) ORDER BY c.id DESC LIMIT 20 OFFSET ?`, [k, k, (page - 1) * 20]);
  res.json(rows.map(x => ({ ...x, jobs: json(x.jobs) || [] })));
}));

// Server-side render + save, using the same renderer as the preview.
r.post('/', h(async (req, res) => {
  const { kind, settings = {}, image, adId, wpId, title, link, templateId, publish, channelIds, bg } = req.body || {};
  if (!['main', 'text', 'opening'].includes(kind)) return res.status(400).json({ error: 'অবৈধ কার্ডের ধরন' });
  let ad;
  if (settings.adOn === false) ad = null;
  else if (!adId || adId === 'auto') ad = await takeAd(kind);
  else ad = await one('SELECT * FROM ads WHERE id=?', [adId]);
  const cardTitle = title || settings.headline || settings.text || '';
  const { card } = await createCard({ kind, settings, image, bg, title: cardTitle, link, wpId: wpId || null, templateId, ad, origin: 'manual', userId: req.user.id });
  let queued = 0;
  if (publish) queued = await enqueue(card.id, { purpose: kind === 'main' ? 'news' : 'text', channelIds, caption: cardTitle, link });
  res.json({ card, queued });
}));

r.post('/:id/publish', h(async (req, res) => {
  const c = await one('SELECT * FROM photocards WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'কার্ড নেই' });
  const purpose = c.kind === 'main' ? 'news' : c.origin === 'schedule' ? 'schedule' : 'text';
  const queued = await enqueue(c.id, { purpose, channelIds: req.body?.channelIds, caption: req.body?.caption || c.title, link: c.link });
  res.json({ queued, note: queued ? '' : 'নতুন কোনো প্ল্যাটফর্ম নেই — যেখানে আগে পাঠানো হয়েছে সেখানে আবার পাঠানো হয় না' });
}));
r.delete('/:id', h(async (req, res) => {
  const c = await one('SELECT * FROM photocards WHERE id=?', [req.params.id]);
  if (c) {
    fs.rmSync(path.resolve('.' + c.file), { force: true });
    await q("DELETE FROM publish_jobs WHERE photocard_id=? AND status IN ('queued','retry')", [c.id]);
    await q('DELETE FROM photocards WHERE id=?', [c.id]);
  }
  res.json({ ok: true });
}));

// ---------- uploads & image helpers ----------
r.post('/upload', upload.single('file'), h(async (req, res) => {
  if (!req.file || !looksLikeImage(req.file)) return res.status(400).json({ error: 'বৈধ ছবি নয়' });
  res.json({ url: fileUrl(req.file) });
}));

// Same-origin image proxy so remote images do not taint the preview canvas (CORS)
r.get('/proxy', h(async (req, res) => {
  const url = String(req.query.url || '');
  if (url.startsWith('/uploads/')) {
    const p = path.resolve('.' + path.posix.normalize(url));
    if (!p.startsWith(path.resolve('uploads'))) return res.status(400).end();
    return res.sendFile(p);
  }
  await assertPublicUrl(url);
  const up = await http(url, {}, { timeout: 20000, retries: 1 });
  const type = up.headers.get('content-type') || '';
  if (!up.ok || !/^image\//.test(type)) return res.status(502).json({ error: 'ছবি লোড করা যায়নি' });
  res.set('Content-Type', type).set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(await up.arrayBuffer()));
}));

// AI background removal for the opening photocard -> transparent PNG
r.post('/remove-bg', memUpload.single('file'), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ছবি দিন' });
  const t0 = Date.now();
  try {
    const out = await removeBackground(req.file.buffer, req.file.mimetype);
    const url = saveBuffer(out.buffer, '.png');
    await L.success('bg-remove', `ব্যাকগ্রাউন্ড রিমুভ (${out.provider}) ${Date.now() - t0}ms`);
    res.json({ url, provider: out.provider });
  } catch (e) {
    await L.error('bg-remove', e.message);
    res.status(502).json({ error: e.message });
  }
}));
export default r;
