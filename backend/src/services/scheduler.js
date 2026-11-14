// One "tick" does all background work. It runs every minute in-process (node-cron) and can also be
// triggered by a cPanel cron job hitting /api/cron/<CRON_KEY>, because Passenger may put an idle
// Node app to sleep. A MySQL named lock ensures only one tick runs at a time across processes.
import cron from 'node-cron';
import { pool, getSetting } from '../db.js';
import { syncLatest } from './wordpress.js';
import { createCard, enqueue, processQueue, defaultTemplate } from './publisher.js';
import { dueBulletins } from './bulletins.js';
import { newsTick } from './news.js';
import * as L from '../log.js';

// New WordPress post -> main photocard (default template + next ad in the cycle) -> social queue
export async function onNewWpPost(p) {
  const tpl = await defaultTemplate('main');
  const { card, existed } = await createCard({
    kind: 'main', settings: { ...tpl.settings, headline: p.title, category: p.category }, image: p.image,
    title: p.title, link: p.link, wpId: p.id, templateId: tpl.id, origin: 'auto', uniq: `wp:${p.id}:main`,
  });
  if (existed) return;
  const n = await enqueue(card.id, { purpose: 'news', caption: p.title, link: p.link });
  await L.info('pipeline', `সংবাদ #${p.id}: ফটোকার্ড #${card.id}, ${n}টি প্ল্যাটফর্মে প্রকাশ সারিতে`);
}

let lastWpPoll = 0;
export async function tick(source = 'timer') {
  const conn = await pool.getConnection();
  try {
    const [[{ got }]] = await conn.query("SELECT GET_LOCK('dnb_tick', 0) got");
    if (!got) return { skipped: 'another tick is running' };
    try {
      const auto = await getSetting('automation', {});
      const wp = await getSetting('wp', {});
      const out = {};
      if (auto.enabled !== false && !auto.emergency_stop) {
        if (wp.auto_detect && Date.now() - lastWpPoll >= (wp.poll_minutes || 2) * 60_000) {
          lastWpPoll = Date.now();
          out.wp = await syncLatest(onNewWpPost);
        }
        await dueBulletins();
        out.published = await processQueue(10);
        await newsTick();
      }
      return { ok: true, source, ...out };
    } finally {
      await conn.query("SELECT RELEASE_LOCK('dnb_tick')");
    }
  } finally {
    conn.release();
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', () => tick().catch(e => L.error('scheduler', 'টিক ব্যর্থ: ' + e.message)), { timezone: 'Asia/Dhaka' });
  // keep the log table bounded: drop info logs older than 60 days (errors/audit are kept)
  cron.schedule('30 3 * * *', async () => {
    const { q } = await import('../db.js');
    await q("DELETE FROM logs WHERE level IN ('info','success') AND created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)");
  }, { timezone: 'Asia/Dhaka' });
}
