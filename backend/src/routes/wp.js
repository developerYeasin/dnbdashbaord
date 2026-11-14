import { Router } from 'express';
import crypto from 'crypto';
import { q, one, getSetting, patchSetting } from '../db.js';
import { requireAdmin, h } from '../auth.js';
import * as WP from '../services/wordpress.js';
import { onNewWpPost } from '../services/scheduler.js';
import { setSecret, maskedSecret } from '../services/secrets.js';
import * as L from '../log.js';

const r = Router();

r.get('/overview', h(async (_, res) => {
  const wp = await getSetting('wp');
  const [cards, ads, staff, queue, failed] = await Promise.all([
    one('SELECT COUNT(*) c FROM photocards WHERE DATE(created_at)=CURDATE()'),
    one('SELECT COUNT(*) c FROM ads WHERE active=1 AND (start_date IS NULL OR start_date<=CURDATE()) AND (end_date IS NULL OR end_date>=CURDATE())'),
    one('SELECT COUNT(*) c FROM staff'),
    one("SELECT COUNT(*) c FROM publish_jobs WHERE status IN ('queued','retry','running')"),
    one("SELECT COUNT(*) c FROM publish_jobs WHERE status='failed' AND DATE(updated_at)=CURDATE()"),
  ]);
  const detectedToday = await one('SELECT COUNT(*) c FROM wp_seen WHERE DATE(seen_at)=CURDATE()');
  res.json({
    cardsToday: cards.c, activeAds: ads.c, staff: staff.c, queue: queue.c, failedToday: failed.c, detectedToday: detectedToday.c,
    wp: { url: wp.url, status: wp.last_status, error: wp.last_error, lastSync: wp.last_sync, total: wp.total ?? null, autoDetect: !!wp.auto_detect },
  });
}));

r.get('/posts', h(async (req, res) => {
  const { page = 1, per_page = 6, date, search } = req.query;
  const opt = { page: Math.max(1, Number(page)), perPage: Math.min(50, Number(per_page) || 6), search };
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { opt.after = `${date}T00:00:00`; opt.before = `${date}T23:59:59`; }
  res.json(await WP.listPosts(opt));
}));
r.get('/posts/:id', h(async (req, res) => res.json(await WP.getPost(req.params.id))));
r.get('/calendar', h(async (req, res) => {
  const { year, month } = req.query;
  const [counts, first] = await Promise.all([WP.monthCounts(year, month), WP.firstPostDate()]);
  res.json({ counts, first });
}));
r.get('/categories', h(async (_, res) => res.json(await WP.categories())));

r.post('/sync', h(async (_, res) => {
  WP.clearWpCache();
  const out = await WP.syncLatest(onNewWpPost);
  if (!out.ok) return res.status(502).json({ error: out.error });
  res.json(out);
}));

r.get('/settings', h(async (_, res) => {
  const wp = await getSetting('wp');
  res.json({ ...wp, app_password: await maskedSecret('wp_app_password'), webhook_url: wp.webhook_secret ? `/api/webhook/wordpress/${wp.webhook_secret}` : '' });
}));
r.put('/settings', requireAdmin, h(async (req, res) => {
  const { url, username, auto_detect, poll_minutes, app_password } = req.body || {};
  if (url && !/^https:\/\//.test(url)) return res.status(400).json({ error: 'ওয়েবসাইট URL অবশ্যই https:// দিয়ে শুরু হবে' });
  const patch = { url: url?.replace(/\/+$/, ''), username, auto_detect: !!auto_detect, poll_minutes: Math.min(60, Math.max(1, Number(poll_minutes) || 2)) };
  const cur = await getSetting('wp');
  if (!cur.webhook_secret) patch.webhook_secret = crypto.randomBytes(18).toString('hex');
  await patchSetting('wp', patch);
  await setSecret('wp_app_password', app_password);
  WP.clearWpCache();
  await L.info('settings', `WordPress সেটিংস সংরক্ষণ — ${req.user.email}`);
  res.json({ ok: true });
}));
r.post('/auto-detect', h(async (req, res) => {
  await patchSetting('wp', { auto_detect: !!req.body.on });
  await L.info('settings', `স্বয়ংক্রিয় সংবাদ শনাক্তকরণ ${req.body.on ? 'চালু' : 'বন্ধ'} — ${req.user.email}`);
  res.json({ ok: true });
}));
r.post('/test', requireAdmin, h(async (_, res) => res.json(await WP.testConnection())));
export default r;

// Public webhook (secret in URL) called by WordPress right after a post is published
export const webhook = Router();
webhook.post('/wordpress/:secret', h(async (req, res) => {
  const wp = await getSetting('wp');
  const a = Buffer.from(String(req.params.secret)), b = Buffer.from(String(wp.webhook_secret || ''));
  if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'forbidden' });
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id missing' });
  res.json({ ok: true }); // answer fast; WordPress should not wait for rendering
  try {
    const p = await WP.getPost(id); // re-read from the API instead of trusting the payload
    const ins = await q('INSERT IGNORE INTO wp_seen (wp_id,title,link,image,category,published_at,processed) VALUES (?,?,?,?,?,?,1)', [p.id, p.title, p.link, p.image, p.category, p.date.replace('T', ' ')]);
    await L.info('wordpress', `Webhook: সংবাদ #${id}${ins.affectedRows ? '' : ' (আগেই শনাক্ত)'}`);
    if (wp.auto_detect) await onNewWpPost(p);
  } catch (e) {
    await L.error('wordpress', `Webhook প্রসেস ব্যর্থ #${id}: ${e.message}`);
  }
}));
