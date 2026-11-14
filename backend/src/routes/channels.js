import { Router } from 'express';
import { q, one, json } from '../db.js';
import { h, requireAdmin } from '../auth.js';
import { PLATFORMS, UnsupportedError } from '../services/social.js';
import { channelCfg, channelSecrets, encryptCfg, processQueue, retryJob, createCard } from '../services/publisher.js';
import { mask, isMask } from '../crypto.js';
import * as L from '../log.js';

const r = Router();

// platform definitions for the settings UI (which fields, which are secret)
r.get('/platforms', (_, res) => res.json(Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, { label: p.label, fields: p.fields }]))));

// Secrets are never sent to the browser: only masked values (••••••1234)
const view = ch => {
  const P = PLATFORMS[ch.platform];
  const sec = channelSecrets(ch);
  const pub = json(ch.public_cfg) || {};
  const cfg = {};
  for (const [k, , secret] of P?.fields || []) cfg[k] = secret ? mask(sec[k]) : pub[k] || '';
  return { ...ch, secret_cfg: undefined, public_cfg: undefined, cfg, label: P?.label };
};

r.get('/', h(async (_, res) => res.json((await q('SELECT * FROM channels ORDER BY id')).map(view))));

function split(platform, cfg, old = {}) {
  const P = PLATFORMS[platform];
  if (!P) throw Object.assign(new Error('অসমর্থিত প্ল্যাটফর্ম'), { status: 400 });
  const pub = {}, sec = { ...old };
  for (const [k, , secret] of P.fields) {
    const v = (cfg?.[k] ?? '').toString().trim();
    if (secret) { if (!isMask(v)) sec[k] = v; } else pub[k] = v;
  }
  return { pub, sec };
}
const FLAGS = ['active', 'use_news', 'use_text', 'use_schedule', 'link_in_comment'];
const flags = b => Object.fromEntries(FLAGS.filter(f => b[f] !== undefined).map(f => [f, b[f] ? 1 : 0]));

r.post('/', requireAdmin, h(async (req, res) => {
  const { platform, name, cfg } = req.body || {};
  const { pub, sec } = split(platform, cfg);
  const x = await q('INSERT INTO channels SET ?', [{ platform, name: name || PLATFORMS[platform].label, public_cfg: JSON.stringify(pub), secret_cfg: encryptCfg(sec), ...flags(req.body) }]);
  await L.info('settings', `${PLATFORMS[platform].label} যোগ: ${name} — ${req.user.email}`);
  res.json({ id: x.insertId });
}));
r.put('/:id', requireAdmin, h(async (req, res) => {
  const ch = await one('SELECT * FROM channels WHERE id=?', [req.params.id]);
  if (!ch) return res.status(404).json({ error: 'নেই' });
  const set = { ...flags(req.body) };
  if (req.body.name) set.name = req.body.name;
  if (req.body.cfg) {
    const { pub, sec } = split(ch.platform, req.body.cfg, channelSecrets(ch));
    Object.assign(set, { public_cfg: JSON.stringify(pub), secret_cfg: encryptCfg(sec), status: 'unchecked' });
  }
  await q('UPDATE channels SET ? WHERE id=?', [set, ch.id]);
  await L.info('settings', `চ্যানেল আপডেট: ${ch.name} — ${req.user.email}`);
  res.json({ ok: true });
}));
r.delete('/:id', requireAdmin, h(async (req, res) => {
  const ch = await one('SELECT name FROM channels WHERE id=?', [req.params.id]);
  await q("DELETE FROM publish_jobs WHERE channel_id=? AND status IN ('queued','retry')", [req.params.id]);
  await q('DELETE FROM channels WHERE id=?', [req.params.id]);
  await L.info('settings', `সংযোগ বিচ্ছিন্ন: ${ch?.name} — ${req.user.email}`);
  res.json({ ok: true });
}));

// Real API call; status reflects the actual response, never just "saved"
r.post('/:id/test', h(async (req, res) => {
  const ch = await one('SELECT * FROM channels WHERE id=?', [req.params.id]);
  if (!ch) return res.status(404).json({ error: 'নেই' });
  const P = PLATFORMS[ch.platform];
  try {
    const out = await P.test(channelCfg(ch));
    await q("UPDATE channels SET status='connected', last_check=NOW(), last_error=NULL WHERE id=?", [ch.id]);
    await L.success('settings', `${P.label} “${ch.name}” সংযোগ সফল: ${out.info}`);
    res.json({ ok: true, info: out.info });
  } catch (e) {
    const st = e instanceof UnsupportedError ? 'unsupported' : 'error';
    await q('UPDATE channels SET status=?, last_check=NOW(), last_error=? WHERE id=?', [st, e.message, ch.id]);
    await L.error('settings', `${P.label} “${ch.name}” সংযোগ ব্যর্থ: ${e.message}`);
    res.json({ ok: false, status: st, error: e.message });
  }
}));

// Sends a real test photocard to this channel only
r.post('/:id/test-post', h(async (req, res) => {
  const ch = await one('SELECT * FROM channels WHERE id=?', [req.params.id]);
  if (!ch) return res.status(404).json({ error: 'নেই' });
  const { card } = await createCard({ kind: 'text', settings: { category: 'পরীক্ষামূলক পোস্ট', text: 'DN Bangla ড্যাশবোর্ড থেকে সংযোগ পরীক্ষা', adOn: false }, title: 'পরীক্ষামূলক পোস্ট', origin: 'test', ad: null, userId: req.user.id });
  await q('INSERT INTO publish_jobs (photocard_id,channel_id,caption) VALUES (?,?,?)', [card.id, ch.id, 'পরীক্ষামূলক পোস্ট — DN Bangla Dashboard']);
  await processQueue(5);
  const job = await one('SELECT status,error,remote_id FROM publish_jobs WHERE photocard_id=? AND channel_id=?', [card.id, ch.id]);
  res.json(job);
}));

// ---------- publish queue ----------
r.get('/jobs', h(async (req, res) => {
  const st = req.query.status || null;
  res.json(await q(`SELECT j.*, ch.name channel_name, ch.platform, c.title, c.file FROM publish_jobs j
    JOIN channels ch ON ch.id=j.channel_id JOIN photocards c ON c.id=j.photocard_id
    WHERE (? IS NULL OR j.status=?) ORDER BY j.id DESC LIMIT 100`, [st, st]));
}));
r.post('/jobs/:id/retry', h(async (req, res) => { await retryJob(req.params.id); await processQueue(5); res.json({ ok: true }); }));
r.post('/jobs/run', h(async (_, res) => res.json({ processed: await processQueue(10) })));
export default r;
