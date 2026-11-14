import { q, getSettings } from '../db.js';
import { renderCard, saveCard } from './photocard.js';
import { nextBanner } from './ads.js';
import { publishToAll } from './publisher.js';

export async function getTemplate(type, id) {
  if (id) {
    const [t] = await q('SELECT * FROM templates WHERE id=?', [id]);
    if (t) return t;
  }
  const [t] = await q('SELECT * FROM templates WHERE type=? AND active=1 ORDER BY is_default DESC, id LIMIT 1', [type]);
  return t || { width: 1080, height: 1080 };
}

/**
 * Create photocard (with rotating ad banner) → save post → publish to all connected accounts.
 * purpose: news | trigger | schedule.  mode: news | text | list
 */
export async function createAndPublish({ source, purpose, mode, title, body = '', link = '', image = null, lines = [], heading, templateId, websiteId = null, externalId = null, publish = true }) {
  const settings = await getSettings();
  const tplType = purpose === 'news' ? 'news' : purpose === 'trigger' ? 'trigger' : 'schedule';
  const template = await getTemplate(tplType, templateId);
  const adGroupId = template.ad_group_id || settings[`ad_group_${tplType}`] || settings.ad_group_default;
  const banner = await nextBanner(adGroupId);

  const buf = await renderCard({ template, mode, title, body, image, lines, heading, adBanner: banner, brand: settings.brand_name || 'DNB News' });
  const card_path = await saveCard(buf, source);

  const r = await q(
    `INSERT INTO posts (source, website_id, external_id, title, body, link, image_url, card_path, template_id, ad_banner_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [source, websiteId, externalId, title, body, link, image, card_path, template.id || null, banner?.id || null, publish ? 'publishing' : 'draft'],
  );
  const post = { id: r.insertId, title, body, link, card_path };
  if (!publish) return { ...post, status: 'draft' };

  const results = await publishToAll(post, purpose);
  const status = !results.length ? 'no_accounts' : results.every(x => x.ok) ? 'published' : results.some(x => x.ok) ? 'partial' : 'failed';
  await q('UPDATE posts SET status=?, results=? WHERE id=?', [status, JSON.stringify(results), post.id]);
  return { ...post, status, results };
}
