// WordPress REST API: read latest posts, calendar, new-post detection, and (for AI news) writing posts.
import { q, one, getSetting, patchSetting } from '../db.js';
import { getSecret } from './secrets.js';
import { http, httpJson } from './http.js';
import * as L from '../log.js';

const cache = new Map(); // key -> { at, data }
const cached = async (key, ttlMs, fn) => {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttlMs) return c.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
};
export const clearWpCache = () => cache.clear();

export async function wpConfig() {
  const s = await getSetting('wp');
  const base = (s.url || 'https://www.dnbangla.com.bd').replace(/\/+$/, '');
  return { ...s, base, api: `${base}/wp-json/wp/v2` };
}

async function authHeader() {
  const { username } = await wpConfig();
  const pass = await getSecret('wp_app_password');
  if (!username || !pass) return null;
  return 'Basic ' + Buffer.from(`${username}:${pass.replace(/\s+/g, '')}`).toString('base64');
}

async function wpGet(path, params = {}, { auth = false } = {}) {
  const { api } = await wpConfig();
  const u = new URL(api + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
  const headers = {};
  if (auth) { const a = await authHeader(); if (a) headers.Authorization = a; }
  const { data, res } = await httpJson(u.toString(), { headers }, { timeout: 20000, retries: 2 });
  return { data, total: Number(res.headers.get('x-wp-total') || 0), pages: Number(res.headers.get('x-wp-totalpages') || 0) };
}

const decode = s => String(s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .trim();

// Normalised post object used everywhere in the dashboard
export function mapPost(p) {
  const media = p._embedded?.['wp:featuredmedia']?.[0];
  const terms = (p._embedded?.['wp:term'] || []).flat();
  const cats = terms.filter(t => t.taxonomy === 'category');
  const img = media?.media_details?.sizes?.full?.source_url || media?.source_url || '';
  return {
    id: p.id,
    title: decode(p.title?.rendered),
    link: p.link,
    date: p.date,
    image: img,
    category: decode(cats[0]?.name || ''),
    categories: cats.map(c => decode(c.name)),
  };
}

const LIST_FIELDS = 'id,date,link,title,featured_media,categories,_links.wp:featuredmedia,_links.wp:term,_embedded';

export async function listPosts({ page = 1, perPage = 6, after, before, search } = {}) {
  const key = `list:${page}:${perPage}:${after}:${before}:${search}`;
  return cached(key, 60_000, async () => {
    const r = await wpGet('/posts', { page, per_page: perPage, after, before, search, _embed: 'wp:featuredmedia,wp:term', _fields: LIST_FIELDS, orderby: 'date', order: 'desc' });
    return { posts: r.data.map(mapPost), total: r.total, pages: r.pages, page: Number(page) };
  });
}

export async function getPost(id) {
  const { data } = await wpGet(`/posts/${Number(id)}`, { _embed: 'wp:featuredmedia,wp:term', _fields: LIST_FIELDS });
  return mapPost(data);
}

// Days of a month that have published posts: { 'YYYY-MM-DD': count }
export async function monthCounts(year, month) {
  const y = Number(year), m = Number(month);
  const pad = n => String(n).padStart(2, '0');
  const after = `${y}-${pad(m)}-01T00:00:00`;
  const end = m === 12 ? `${y + 1}-01-01T00:00:00` : `${y}-${pad(m + 1)}-01T00:00:00`;
  const now = new Date();
  const isPast = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1);
  return cached(`month:${y}-${m}`, isPast ? 6 * 3600_000 : 5 * 60_000, async () => {
    const counts = {};
    let page = 1, pages = 1;
    do {
      const r = await wpGet('/posts', { after, before: end, per_page: 100, page, _fields: 'id,date' });
      for (const p of r.data) { const d = p.date.slice(0, 10); counts[d] = (counts[d] || 0) + 1; }
      pages = r.pages;
      page++;
    } while (page <= pages && page <= 30);
    return counts;
  });
}

// First post date (for "from the beginning" calendar navigation)
export async function firstPostDate() {
  return cached('first', 24 * 3600_000, async () => {
    const r = await wpGet('/posts', { per_page: 1, order: 'asc', orderby: 'date', _fields: 'id,date' });
    return r.data[0]?.date || null;
  });
}

export async function categories() {
  return cached('cats', 10 * 60_000, async () => {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const r = await wpGet('/categories', { per_page: 100, page, _fields: 'id,name,slug,count,parent' });
      all.push(...r.data.map(c => ({ ...c, name: decode(c.name) })));
      if (page >= r.pages) break;
    }
    return all;
  });
}

// Verifies the site and (if given) the Application Password with real requests
export async function testConnection() {
  const out = { site: false, auth: null, total: 0, message: '' };
  try {
    const r = await wpGet('/posts', { per_page: 1, _fields: 'id' });
    out.site = true;
    out.total = r.total;
    const a = await authHeader();
    if (a) {
      try {
        const { data } = await httpJson((await wpConfig()).api + '/users/me?context=edit', { headers: { Authorization: a } }, { retries: 0 });
        out.auth = { ok: true, user: data.name, roles: data.roles, canPublish: (data.roles || []).some(r => ['administrator', 'editor', 'author'].includes(r)) };
      } catch (e) {
        out.auth = { ok: false, error: e.message };
      }
    }
    out.message = `সংযুক্ত — মোট ${out.total} সংবাদ` + (out.auth ? (out.auth.ok ? `, লগইন: ${out.auth.user}` : `, লগইন ব্যর্থ: ${out.auth.error}`) : '');
    await patchSetting('wp', { last_status: out.auth && !out.auth.ok ? 'auth_failed' : 'connected', last_error: out.auth?.ok === false ? out.auth.error : '', total: out.total });
  } catch (e) {
    out.message = e.message;
    await patchSetting('wp', { last_status: 'error', last_error: e.message });
  }
  await L.log(out.site ? 'info' : 'error', 'wordpress', 'সংযোগ পরীক্ষা: ' + out.message);
  return out;
}

let syncing = null;
// Checks the newest posts; anything not seen before is recorded and handed to onNew (photocard pipeline).
// Concurrent calls share the same in-flight promise, so repeated clicks never fan out requests.
export function syncLatest(onNew) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const { posts, total } = await listPosts({ page: 1, perPage: 20 });
      clearWpCache();
      const firstRun = !(await one('SELECT COUNT(*) c FROM wp_seen')).c;
      const fresh = [];
      for (const p of posts) {
        const r = await q('INSERT IGNORE INTO wp_seen (wp_id,title,link,image,category,published_at,processed) VALUES (?,?,?,?,?,?,?)',
          [p.id, p.title, p.link, p.image, p.category, p.date.replace('T', ' '), firstRun ? 1 : 0]);
        if (r.affectedRows && !firstRun) fresh.push(p);
      }
      await patchSetting('wp', { last_sync: new Date().toISOString(), last_status: 'connected', last_error: '', total });
      if (fresh.length) await L.info('wordpress', `${fresh.length}টি নতুন সংবাদ শনাক্ত`, { ids: fresh.map(p => p.id) });
      // oldest first so the ad cycle follows publication order
      for (const p of fresh.reverse()) if (onNew) await onNew(p).catch(e => L.error('pipeline', `সংবাদ ${p.id}: ${e.message}`));
      return { ok: true, total, newCount: fresh.length, firstRun };
    } catch (e) {
      await patchSetting('wp', { last_status: 'error', last_error: e.message });
      await L.error('wordpress', 'সিঙ্ক ব্যর্থ: ' + e.message);
      return { ok: false, error: e.message };
    } finally {
      setTimeout(() => (syncing = null), 0);
    }
  })();
  return syncing;
}

// ---------- write (AI news publisher) ----------
async function wpWrite(method, path, body, headers = {}) {
  const a = await authHeader();
  if (!a) throw new Error('WordPress Username / Application Password সেট করা নেই');
  const { api } = await wpConfig();
  const isBuf = Buffer.isBuffer(body);
  const { data } = await httpJson(api + path, {
    method,
    headers: { Authorization: a, ...(isBuf ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: isBuf ? body : JSON.stringify(body),
  }, { timeout: 45000, retries: 1 });
  return data;
}

export async function uploadMedia(buffer, filename, alt) {
  const m = await wpWrite('POST', '/media', buffer, {
    'Content-Type': 'image/jpeg',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  if (alt) await wpWrite('POST', `/media/${m.id}`, { alt_text: alt }).catch(() => {});
  return m;
}

export async function ensureTags(names) {
  const ids = [];
  for (const name of (names || []).slice(0, 10)) {
    try {
      const { data } = await wpGet('/tags', { search: name, per_page: 5, _fields: 'id,name' });
      const hit = data.find(t => decode(t.name) === name);
      ids.push(hit ? hit.id : (await wpWrite('POST', '/tags', { name })).id);
    } catch { /* tag creation needs edit_terms; skip silently */ }
  }
  return ids;
}

export async function createPost(post) {
  return wpWrite('POST', '/posts', post);
}
export async function updatePost(id, post) {
  return wpWrite('POST', `/posts/${Number(id)}`, post);
}
