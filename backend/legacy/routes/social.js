import { Router } from 'express';
import { crud, wrap } from './crud.js';
import { q } from '../db.js';
import { SUPPORTED_PLATFORMS } from '../services/publisher.js';

const r = Router();
r.get('/platforms', (req, res) => res.json(SUPPORTED_PLATFORMS));

// Verify the token works
r.post('/:id/test', wrap(async (req, res) => {
  const [a] = await q('SELECT * FROM social_accounts WHERE id=?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Not found' });
  let url;
  if (a.platform === 'telegram') url = `https://api.telegram.org/bot${a.access_token}/getChat?chat_id=${encodeURIComponent(a.target_id)}`;
  else if (a.platform === 'facebook' || a.platform === 'instagram') url = `https://graph.facebook.com/v21.0/${a.target_id}?fields=name,id&access_token=${a.access_token}`;
  else return res.json({ ok: true, message: 'No test available for this platform' });
  const d = await (await fetch(url)).json();
  if (d.error || d.ok === false) return res.json({ ok: false, message: d.error?.message || d.description });
  res.json({ ok: true, message: `Connected: ${d.name || d.result?.title || d.result?.username || d.id}` });
}));

crud('social_accounts', ['platform', 'name', 'target_id', 'access_token', 'active', 'use_for_news', 'use_for_trigger', 'use_for_schedule'], { router: r });

export default r;
