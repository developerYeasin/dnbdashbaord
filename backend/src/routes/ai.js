import { Router } from 'express';
import { q, one, json, getSetting } from '../db.js';
import { h, requireAdmin } from '../auth.js';
import { encrypt, decrypt, mask, isMask } from '../crypto.js';
import { PROVIDERS, generate } from '../services/ai.js';
import { fetchSource, writeArticle, publishArticle } from '../services/news.js';
import { assertPublicUrl } from '../services/http.js';
import * as L from '../log.js';

const r = Router();

// ---------- AI keys (several per provider, used in priority order) ----------
r.get('/providers', (_, res) => res.json(PROVIDERS));
r.get('/keys', h(async (_, res) => res.json((await q('SELECT * FROM ai_keys ORDER BY priority, id')).map(k => ({ ...k, key_enc: undefined, key: mask(decrypt(k.key_enc)) })))));
r.post('/keys', requireAdmin, h(async (req, res) => {
  const { provider, label, key, model, base_url, priority, active } = req.body || {};
  if (!PROVIDERS[provider] || !key) return res.status(400).json({ error: 'প্রোভাইডার ও API Key দিন' });
  if (base_url) await assertPublicUrl(base_url);
  await q('INSERT INTO ai_keys SET ?', [{ provider, label: label || PROVIDERS[provider].label, key_enc: encrypt(key.trim()), model: model || PROVIDERS[provider].model, base_url: base_url || null, priority: Number(priority) || 10, active: active === false ? 0 : 1 }]);
  await L.info('settings', `AI Key যোগ: ${provider} — ${req.user.email}`);
  res.json({ ok: true });
}));
r.put('/keys/:id', requireAdmin, h(async (req, res) => {
  const { label, key, model, base_url, priority, active } = req.body || {};
  const set = {};
  if (label !== undefined) set.label = label;
  if (model !== undefined) set.model = model;
  if (base_url !== undefined) { if (base_url) await assertPublicUrl(base_url); set.base_url = base_url || null; }
  if (priority !== undefined) set.priority = Number(priority) || 10;
  if (active !== undefined) set.active = active ? 1 : 0;
  if (key && !isMask(key)) set.key_enc = encrypt(key.trim());
  if (Object.keys(set).length) await q('UPDATE ai_keys SET ? WHERE id=?', [set, req.params.id]);
  res.json({ ok: true });
}));
r.delete('/keys/:id', requireAdmin, h(async (req, res) => { await q('DELETE FROM ai_keys WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
r.post('/keys/:id/test', requireAdmin, h(async (req, res) => {
  const k = await one('SELECT provider FROM ai_keys WHERE id=?', [req.params.id]);
  if (['removebg', 'photoroom', 'clipdrop'].includes(k?.provider)) return res.json({ ok: true, info: 'ব্যাকগ্রাউন্ড রিমুভ Key — অপেনিং ফটোকার্ডে ছবি আপলোড করে পরীক্ষা করুন (প্রতিটি পরীক্ষায় ক্রেডিট খরচ হয়)' });
  try {
    const out = await generate('Reply with exactly: OK', 'ping', { maxTokens: 10, keyId: Number(req.params.id) });
    res.json({ ok: true, info: `${out.provider}: ${out.text.trim().slice(0, 40)}` });
  } catch (e) { res.json({ ok: false, error: e.message }); }
}));

// ---------- sources ----------
const SF = ['name', 'site_url', 'type', 'feed_url', 'wp_category_id', 'wp_category_name', 'language', 'region', 'image_policy', 'image_license', 'interval_min', 'daily_limit', 'publish_mode', 'ai_instructions', 'active'];
async function srcBody(b) {
  const o = {};
  for (const f of SF) if (b[f] !== undefined) o[f] = b[f] === '' && ['wp_category_id'].includes(f) ? null : b[f];
  if (o.active !== undefined) o.active = o.active ? 1 : 0;
  if (o.interval_min !== undefined && ![5, 10, 15, 30, 60].includes(Number(o.interval_min))) throw Object.assign(new Error('সংগ্রহের বিরতি ৫/১০/১৫/৩০/৬০ মিনিট'), { status: 400 });
  if (o.publish_mode && !['review', 'draft', 'pending', 'publish'].includes(o.publish_mode)) throw Object.assign(new Error('অবৈধ প্রকাশ পদ্ধতি'), { status: 400 });
  for (const u of [o.site_url, o.feed_url]) if (u) await assertPublicUrl(u);
  // guess the type from a pasted link
  if (!o.type && o.feed_url) o.type = /wp-json/.test(o.feed_url) ? 'wordpress' : /(rss|feed|\.xml|atom)/i.test(o.feed_url) ? 'rss' : 'page';
  return o;
}
r.get('/sources', h(async (_, res) => res.json(await q(`SELECT s.*, (SELECT COUNT(*) FROM news_items i WHERE i.source_id=s.id AND DATE(i.created_at)=CURDATE()) today FROM news_sources s ORDER BY s.id`))));
r.post('/sources', requireAdmin, h(async (req, res) => {
  const o = await srcBody(req.body || {});
  if (!o.name || !(o.feed_url || o.site_url)) return res.status(400).json({ error: 'নাম ও RSS/API/ক্যাটাগরি লিংক দিন' });
  const x = await q('INSERT INTO news_sources SET ?', [o]);
  await L.info('news', `সোর্স যোগ: ${o.name} — ${req.user.email}`);
  res.json({ id: x.insertId });
}));
r.put('/sources/:id', requireAdmin, h(async (req, res) => { await q('UPDATE news_sources SET ? WHERE id=?', [await srcBody(req.body || {}), req.params.id]); res.json({ ok: true }); }));
r.delete('/sources/:id', requireAdmin, h(async (req, res) => { await q('DELETE FROM news_sources WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
r.post('/sources/:id/fetch', h(async (req, res) => {
  try { res.json(await fetchSource(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); }
}));

// ---------- items & articles ----------
r.get('/items', h(async (req, res) => {
  const st = req.query.status || null, src = req.query.source || null;
  res.json(await q(`SELECT i.id,i.source_id,i.url,i.title,i.summary,i.image,i.published_at,i.status,i.duplicate_of,i.error,i.created_at,s.name source_name,
      a.id article_id FROM news_items i JOIN news_sources s ON s.id=i.source_id LEFT JOIN ai_articles a ON a.item_id=i.id
    WHERE (? IS NULL OR i.status=?) AND (? IS NULL OR i.source_id=?) ORDER BY i.id DESC LIMIT 200`, [st, st, src, src]));
}));
r.post('/items/:id/write', h(async (req, res) => {
  try { res.json(await writeArticle(req.params.id, { extra: req.body?.instructions || '' })); } catch (e) { res.status(502).json({ error: e.message }); }
}));
r.post('/items/:id/ignore', h(async (req, res) => { await q("UPDATE news_items SET status='ignored' WHERE id=?", [req.params.id]); res.json({ ok: true }); }));

r.get('/articles', h(async (req, res) => {
  const st = req.query.status || null;
  const rows = await q(`SELECT a.*, s.name source_name, i.url source_url FROM ai_articles a LEFT JOIN news_sources s ON s.id=a.source_id LEFT JOIN news_items i ON i.id=a.item_id
    WHERE (? IS NULL OR a.status=?) ORDER BY a.id DESC LIMIT 200`, [st, st]);
  res.json(rows.map(a => ({ ...a, tags: json(a.tags) || [], uncertain: json(a.uncertain) || [] })));
}));
r.put('/articles/:id', h(async (req, res) => {
  const f = ['title', 'summary', 'body', 'seo_title', 'meta_description', 'alt_text', 'category_id'];
  const set = Object.fromEntries(f.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
  if (req.body.tags) set.tags = JSON.stringify(req.body.tags);
  if (Object.keys(set).length) await q('UPDATE ai_articles SET ? WHERE id=?', [set, req.params.id]);
  res.json({ ok: true });
}));
r.post('/articles/:id/reject', h(async (req, res) => { await q("UPDATE ai_articles SET status='rejected' WHERE id=?", [req.params.id]); await L.info('ai', `প্রতিবেদন বাতিল #${req.params.id} — ${req.user.email}`); res.json({ ok: true }); }));
r.post('/articles/:id/approve', h(async (req, res) => { await q("UPDATE ai_articles SET status='approved' WHERE id=? AND wp_post_id IS NULL", [req.params.id]); res.json({ ok: true }); }));
r.post('/articles/:id/wordpress', h(async (req, res) => {
  const status = ['draft', 'pending', 'publish'].includes(req.body?.status) ? req.body.status : 'draft';
  try { const p = await publishArticle(req.params.id, status); res.json({ id: p.id, link: p.link, status: p.status }); } catch (e) { res.status(502).json({ error: e.message }); }
}));
r.delete('/articles/:id', h(async (req, res) => { await q('DELETE FROM ai_articles WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

// ---------- hub dashboard ----------
r.get('/stats', h(async (_, res) => {
  const c = async sql => (await one(sql)).c;
  const auto = await getSetting('automation', {});
  const [collected, drafts, published, review, dups, failed] = await Promise.all([
    c('SELECT COUNT(*) c FROM news_items WHERE DATE(created_at)=CURDATE()'),
    c("SELECT COUNT(*) c FROM ai_articles WHERE status='draft' AND DATE(updated_at)=CURDATE()"),
    c("SELECT COUNT(*) c FROM ai_articles WHERE status='published' AND DATE(updated_at)=CURDATE()"),
    c("SELECT COUNT(*) c FROM ai_articles WHERE status IN ('review','approved')"),
    c("SELECT COUNT(*) c FROM news_items WHERE status='duplicate' AND DATE(created_at)=CURDATE()"),
    c("SELECT COUNT(*) c FROM news_items WHERE status='error' AND DATE(created_at)=CURDATE()"),
  ]);
  const byCat = await q(`SELECT COALESCE(s.wp_category_name,'—') cat, COUNT(i.id) items, SUM(i.status='published') published
    FROM news_items i JOIN news_sources s ON s.id=i.source_id WHERE DATE(i.created_at)=CURDATE() GROUP BY cat`);
  const usage = await q('SELECT provider, label, model, calls, tokens_in, tokens_out, fails, last_error FROM ai_keys ORDER BY priority');
  const next = await one('SELECT MIN(DATE_ADD(COALESCE(last_fetch, NOW()), INTERVAL interval_min MINUTE)) t FROM news_sources WHERE active=1');
  const last = await one('SELECT MAX(last_fetch) t FROM news_sources');
  res.json({ collected, drafts, published, review, dups, failed, byCat, usage, nextRun: next?.t, lastRun: last?.t, automation: auto });
}));
export default r;
