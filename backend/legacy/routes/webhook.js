import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from './crud.js';
import { publishWpPost, normalizeWp } from '../services/wordpress.js';

const r = Router();

/**
 * Instant publish from WordPress. Point a WP webhook (e.g. "WP Webhooks" plugin, action post_published,
 * or a small functions.php hook) to:  POST {PUBLIC_URL}/api/webhook/wordpress/{webhook_secret}
 * Body: WP post JSON, or { id, title, link, image }
 */
r.post('/wordpress/:secret', wrap(async (req, res) => {
  const [site] = await q('SELECT * FROM websites WHERE webhook_secret=? AND active=1', [req.params.secret]);
  if (!site) return res.status(404).json({ error: 'Unknown site' });
  const b = req.body.post || req.body;
  const wp = { ...normalizeWp(b), image: b.image || b.featured_image || b.post_thumbnail || normalizeWp(b).image };
  if (!wp.id || !wp.title) return res.status(400).json({ error: 'id and title required' });
  res.json({ ok: true, queued: true });
  publishWpPost(site, wp)
    .then(() => wp.id > site.last_post_id && q('UPDATE websites SET last_post_id=? WHERE id=?', [wp.id, site.id]))
    .catch(e => console.error('[webhook]', e.message));
}));

export default r;
