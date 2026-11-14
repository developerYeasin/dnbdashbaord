import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from './crud.js';
import { upload, fileUrl } from '../upload.js';
import { createAndPublish } from '../services/pipeline.js';
import { publishToAll } from '../services/publisher.js';

const r = Router();

r.get('/', wrap(async (req, res) => {
  const { source, status, page = 1 } = req.query;
  const cond = [], params = [];
  if (source) { cond.push('source LIKE ?'); params.push(`${source}%`); }
  if (status) { cond.push('status=?'); params.push(status); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limit = 30, offset = (Number(page) - 1) * limit;
  const rows = await q(`SELECT * FROM posts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await q(`SELECT COUNT(*) total FROM posts ${where}`, params);
  res.json({ rows, total, page: Number(page), pages: Math.ceil(total / limit) });
}));

// Community feed / trigger: text only → trigger photocard → all social media
r.post('/community', wrap(async (req, res) => {
  const { text, heading, template_id, publish = true } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'লেখা প্রয়োজন' });
  res.json(await createAndPublish({ source: 'community', purpose: 'trigger', mode: 'text', title: text.trim(), heading, templateId: template_id, publish: publish !== false && publish !== 'false' }));
}));

// Manual news card (headline + image)
r.post('/news', upload.single('image'), wrap(async (req, res) => {
  const { title, link, image_url, template_id, publish } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'শিরোনাম প্রয়োজন' });
  res.json(await createAndPublish({ source: 'manual', purpose: 'news', mode: 'news', title: title.trim(), link, image: fileUrl(req.file) || image_url, templateId: template_id, publish: publish !== 'false' }));
}));

r.post('/:id(\\d+)/republish', wrap(async (req, res) => {
  const [p] = await q('SELECT * FROM posts WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const purpose = p.source.startsWith('schedule') ? 'schedule' : p.source === 'community' ? 'trigger' : 'news';
  const results = await publishToAll(p, purpose);
  const status = !results.length ? 'no_accounts' : results.every(x => x.ok) ? 'published' : results.some(x => x.ok) ? 'partial' : 'failed';
  await q('UPDATE posts SET status=?, results=? WHERE id=?', [status, JSON.stringify(results), p.id]);
  res.json({ status, results });
}));

r.delete('/:id(\\d+)', wrap(async (req, res) => {
  await q('DELETE FROM posts WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

export default r;
