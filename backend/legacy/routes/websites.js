import { Router } from 'express';
import crypto from 'crypto';
import { crud, wrap } from './crud.js';
import { q } from '../db.js';
import { checkSite } from '../services/wordpress.js';

const r = Router();

r.post('/', (req, res, next) => {
  req.body.webhook_secret = crypto.randomBytes(16).toString('hex');
  next();
});

r.post('/:id/check', wrap(async (req, res) => {
  const [s] = await q('SELECT * FROM websites WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const done = await checkSite(s);
  res.json({ ok: true, published: done.length });
}));

crud('websites', ['name', 'url', 'auto_post', 'template_id', 'active', 'webhook_secret', 'last_post_id'], { router: r });

export default r;
