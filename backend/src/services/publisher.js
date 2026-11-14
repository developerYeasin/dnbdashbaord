// Card creation + publish queue.
// One job per (photocard, channel) is enforced by a UNIQUE key, so a post that already succeeded on a
// platform is never sent there again, even if detection, a retry or a second admin fires twice.
import fs from 'fs';
import path from 'path';
import { q, one, json, getSetting } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { PLATFORMS, UnsupportedError } from './social.js';
import { renderCard, saveCard } from './render.js';
import { takeAd } from './ads.js';
import * as L from '../log.js';

export const channelSecrets = ch => { try { return JSON.parse(decrypt(ch.secret_cfg) || '{}'); } catch { return {}; } };
export const channelCfg = ch => ({ ...(json(ch.public_cfg) || {}), ...channelSecrets(ch) });
export const encryptCfg = obj => encrypt(JSON.stringify(obj));

export async function defaultTemplate(kind) {
  const t = await one('SELECT * FROM card_templates WHERE kind=? ORDER BY is_default DESC, id LIMIT 1', [kind]);
  return t ? { ...t, settings: json(t.settings) || {} } : { id: null, settings: {} };
}

// Renders and stores a card. `uniq` (e.g. "wp:123:main") makes auto-creation idempotent.
export async function createCard({ kind, settings, image, bg, title, link, wpId = null, templateId = null, ad = undefined, origin = 'manual', uniq = null, userId = null }) {
  if (uniq) {
    const ex = await one('SELECT * FROM photocards WHERE uniq=?', [uniq]);
    if (ex) return { card: ex, existed: true };
  }
  const useAd = ad === undefined ? (settings.adOn === false ? null : await takeAd(kind)) : ad;
  const t0 = Date.now();
  const buf = await renderCard(kind, settings, { image, bg, ad: useAd?.image });
  const file = saveCard(buf, `${kind}-${wpId || 'card'}`);
  try {
    const r = await q('INSERT INTO photocards (kind,uniq,wp_id,title,link,template_id,ad_id,file,origin,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [kind, uniq, wpId, title || '', link || '', templateId, useAd?.id || null, file, origin, userId]);
    await L.success('photocard', `ফটোকার্ড তৈরি (${kind}) ${Date.now() - t0}ms: ${String(title || '').slice(0, 80)}`, { id: r.insertId, ad: useAd?.name });
    return { card: await one('SELECT * FROM photocards WHERE id=?', [r.insertId]), existed: false };
  } catch (e) {
    fs.rmSync(path.resolve('.' + file), { force: true });
    if (e.code === 'ER_DUP_ENTRY' && uniq) return { card: await one('SELECT * FROM photocards WHERE uniq=?', [uniq]), existed: true };
    throw e;
  }
}

const USE_COL = { news: 'use_news', text: 'use_text', schedule: 'use_schedule' };

export async function enqueue(cardId, { purpose = 'news', channelIds = null, caption = '', link = '' } = {}) {
  const auto = await getSetting('automation', {});
  if (auto.emergency_stop) { await L.warn('publish', 'জরুরি স্টপ চালু — প্রকাশ সারিতে যোগ করা হয়নি'); return 0; }
  const chans = channelIds?.length
    ? await q('SELECT id FROM channels WHERE active=1 AND id IN (?)', [channelIds])
    : await q(`SELECT id FROM channels WHERE active=1 AND ${USE_COL[purpose] || 'use_news'}=1`);
  let n = 0;
  for (const c of chans) {
    const r = await q('INSERT IGNORE INTO publish_jobs (photocard_id,channel_id,caption,link) VALUES (?,?,?,?)', [cardId, c.id, caption, link]);
    n += r.affectedRows;
  }
  return n;
}

const publicUrl = file => `${(process.env.PUBLIC_URL || '').replace(/\/+$/, '')}${file}`;

async function runJob(job) {
  const ch = await one('SELECT * FROM channels WHERE id=?', [job.channel_id]);
  const card = await one('SELECT * FROM photocards WHERE id=?', [job.photocard_id]);
  if (!ch || !card) { await q("UPDATE publish_jobs SET status='failed', error='চ্যানেল বা কার্ড মুছে ফেলা হয়েছে' WHERE id=?", [job.id]); return; }
  const P = PLATFORMS[ch.platform];
  const attempt = job.attempts + 1;
  await q("UPDATE publish_jobs SET status='running', attempts=? WHERE id=?", [attempt, job.id]);
  try {
    const buffer = fs.readFileSync(path.resolve('.' + card.file));
    const res = await P.publish(channelCfg(ch), {
      buffer, imageUrl: publicUrl(card.file), caption: job.caption || card.title, link: job.link || card.link,
      firstComment: !!ch.link_in_comment,
    });
    await q("UPDATE publish_jobs SET status='ok', remote_id=?, error=? WHERE id=?", [res.id || '', res.note || null, job.id]);
    await L.success('publish', `${P.label} “${ch.name}”-এ প্রকাশিত (কার্ড #${card.id})`, { remote_id: res.id, note: res.note });
  } catch (e) {
    if (e instanceof UnsupportedError) {
      await q("UPDATE publish_jobs SET status='unsupported', error=? WHERE id=?", [e.message, job.id]);
      await L.warn('publish', `${P.label}: ${e.message}`);
      return;
    }
    const permanent = [400, 401, 403].includes(e.status) || attempt >= 4;
    const delayMin = 2 ** attempt; // 2, 4, 8 minutes
    await q(`UPDATE publish_jobs SET status=?, error=?, next_at=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?`,
      [permanent ? 'failed' : 'retry', e.message.slice(0, 1000), delayMin, job.id]);
    await L.error('publish', `${P.label} “${ch.name}” ব্যর্থ (চেষ্টা ${attempt}): ${e.message}`, { status: e.status, card: card.id });
  }
}

let busy = false;
export async function processQueue(limit = 10) {
  if (busy) return 0;
  busy = true;
  try {
    const auto = await getSetting('automation', {});
    if (auto.emergency_stop) return 0;
    // Claim jobs atomically so two processes (cron URL + in-process timer) never run the same job
    const jobs = await q("SELECT * FROM publish_jobs WHERE status IN ('queued','retry') AND next_at <= NOW() ORDER BY id LIMIT ?", [limit]);
    let n = 0;
    for (const j of jobs) {
      const claim = await q("UPDATE publish_jobs SET status='running' WHERE id=? AND status IN ('queued','retry')", [j.id]);
      if (!claim.affectedRows) continue;
      await runJob(j);
      n++;
    }
    // jobs stuck in 'running' for >15 min (process crashed) go back to retry
    await q("UPDATE publish_jobs SET status='retry' WHERE status='running' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    return n;
  } finally {
    busy = false;
  }
}

export async function retryJob(id) {
  await q("UPDATE publish_jobs SET status='queued', next_at=NOW(), attempts=0 WHERE id=? AND status IN ('failed','retry')", [id]);
}
