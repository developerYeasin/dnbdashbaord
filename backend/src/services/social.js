// Social platform adapters. Each one makes real API calls only, never fake success.
// test(cfg) -> { ok, info } ; publish(cfg, { buffer, imageUrl, caption, link, firstComment }) -> { id, url? }
// Platforms whose official API cannot post an image card throw UnsupportedError (shown as "অসমর্থিত").
import crypto from 'crypto';
import { http, httpJson } from './http.js';

export class UnsupportedError extends Error {}
const GRAPH = 'https://graph.facebook.com/v21.0';

function needPublicUrl(imageUrl, platform) {
  if (!imageUrl || !/^https:\/\//.test(imageUrl) || /localhost|127\.0\.0\.1/.test(imageUrl)) {
    throw new Error(`${platform} কার্ডের ছবি একটি পাবলিক HTTPS URL থেকে নেয়। backend/.env-এ PUBLIC_URL আপনার সার্ভারের https ঠিকানায় সেট করুন।`);
  }
}

const form = (fields, file) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
  if (file) fd.append(file.field, new Blob([file.buffer], { type: 'image/jpeg' }), file.name || 'photocard.jpg');
  return fd;
};

// ---------- X (OAuth 1.0a user context) ----------
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function oauthHeader(method, url, c, extra = {}) {
  const o = {
    oauth_consumer_key: c.api_key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000), oauth_token: c.access_token, oauth_version: '1.0',
  };
  const all = { ...o, ...extra };
  const base = [method, pct(url), pct(Object.keys(all).sort().map(k => `${pct(k)}=${pct(String(all[k]))}`).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${pct(c.api_secret)}&${pct(c.access_secret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map(k => `${pct(k)}="${pct(String(o[k]))}"`).join(', ');
}

export const PLATFORMS = {
  facebook: {
    label: 'Facebook Page',
    fields: [['page_id', 'Page ID', false], ['access_token', 'Page Access Token', true]],
    async test(c) {
      const { data } = await httpJson(`${GRAPH}/${c.page_id}?fields=id,name&access_token=${encodeURIComponent(c.access_token)}`);
      const perm = await httpJson(`${GRAPH}/debug_token?input_token=${encodeURIComponent(c.access_token)}&access_token=${encodeURIComponent(c.access_token)}`).then(r => r.data.data).catch(() => null);
      const exp = perm?.expires_at ? (perm.expires_at === 0 ? 'মেয়াদহীন' : new Date(perm.expires_at * 1000).toISOString().slice(0, 10)) : 'অজানা';
      const scopes = perm?.scopes || [];
      if (scopes.length && !scopes.includes('pages_manage_posts')) throw new Error('Token-এ pages_manage_posts অনুমতি নেই');
      return { info: `পেজ: ${data.name} · Token মেয়াদ: ${exp}` };
    },
    async publish(c, p) {
      const { data } = await httpJson(`${GRAPH}/${c.page_id}/photos`, {
        method: 'POST',
        body: form({ caption: p.caption, published: 'true', access_token: c.access_token }, { field: 'source', buffer: p.buffer }),
      }, { timeout: 60000, retries: 0 });
      const postId = data.post_id || data.id;
      let note = '';
      if (p.firstComment && p.link) {
        try {
          await httpJson(`${GRAPH}/${postId}/comments`, { method: 'POST', body: form({ message: p.link, access_token: c.access_token }) }, { retries: 0 });
          note = 'প্রথম কমেন্টে লিংক দেওয়া হয়েছে';
        } catch (e) { note = 'কমেন্টে লিংক ব্যর্থ: ' + e.message; }
      }
      return { id: postId, url: `https://facebook.com/${postId}`, note };
    },
  },
  facebook_group: {
    label: 'Facebook Group',
    fields: [['group_id', 'Group ID', false], ['access_token', 'Access Token', true]],
    async test() { throw new UnsupportedError('Meta ২২ এপ্রিল ২০২৪ থেকে Groups API বন্ধ করেছে। API দিয়ে গ্রুপে পোস্ট করা সম্ভব নয়।'); },
    async publish() { throw new UnsupportedError('Facebook Group-এ API দিয়ে পোস্ট সমর্থিত নয় (Groups API বন্ধ)।'); },
  },
  instagram: {
    label: 'Instagram Business',
    fields: [['ig_user_id', 'Business Account ID', false], ['access_token', 'Graph API Token', true]],
    async test(c) {
      const { data } = await httpJson(`${GRAPH}/${c.ig_user_id}?fields=username&access_token=${encodeURIComponent(c.access_token)}`);
      return { info: `@${data.username}` };
    },
    async publish(c, p) {
      needPublicUrl(p.imageUrl, 'Instagram');
      const { data: m } = await httpJson(`${GRAPH}/${c.ig_user_id}/media`, { method: 'POST', body: form({ image_url: p.imageUrl, caption: p.caption, access_token: c.access_token }) }, { timeout: 60000, retries: 0 });
      for (let i = 0; i < 10; i++) {
        const { data: st } = await httpJson(`${GRAPH}/${m.id}?fields=status_code&access_token=${encodeURIComponent(c.access_token)}`);
        if (st.status_code === 'FINISHED') break;
        if (st.status_code === 'ERROR') throw new Error('Instagram মিডিয়া প্রসেস ব্যর্থ');
        await new Promise(r => setTimeout(r, 3000));
      }
      const { data } = await httpJson(`${GRAPH}/${c.ig_user_id}/media_publish`, { method: 'POST', body: form({ creation_id: m.id, access_token: c.access_token }) }, { retries: 0 });
      return { id: data.id };
    },
  },
  threads: {
    label: 'Threads',
    fields: [['user_id', 'Threads User ID', false], ['access_token', 'Access Token', true]],
    async test(c) {
      const { data } = await httpJson(`https://graph.threads.net/v1.0/${c.user_id}?fields=username&access_token=${encodeURIComponent(c.access_token)}`);
      return { info: `@${data.username}` };
    },
    async publish(c, p) {
      needPublicUrl(p.imageUrl, 'Threads');
      const base = `https://graph.threads.net/v1.0/${c.user_id}`;
      const { data: m } = await httpJson(`${base}/threads`, { method: 'POST', body: form({ media_type: 'IMAGE', image_url: p.imageUrl, text: p.caption?.slice(0, 500), access_token: c.access_token }) }, { retries: 0 });
      await new Promise(r => setTimeout(r, 5000));
      const { data } = await httpJson(`${base}/threads_publish`, { method: 'POST', body: form({ creation_id: m.id, access_token: c.access_token }) }, { retries: 0 });
      return { id: data.id };
    },
  },
  x: {
    label: 'X (Twitter)',
    fields: [['api_key', 'API Key', true], ['api_secret', 'API Secret', true], ['access_token', 'Access Token', true], ['access_secret', 'Access Token Secret', true]],
    async test(c) {
      const url = 'https://api.x.com/2/users/me';
      const { data } = await httpJson(url, { headers: { Authorization: oauthHeader('GET', url, c) } }, { retries: 0 });
      return { info: `@${data.data?.username}` };
    },
    async publish(c, p) {
      const up = 'https://api.x.com/2/media/upload';
      const { data: media } = await httpJson(up, {
        method: 'POST',
        headers: { Authorization: oauthHeader('POST', up, c) },
        body: form({ media_category: 'tweet_image', media_type: 'image/jpeg' }, { field: 'media', buffer: p.buffer }),
      }, { timeout: 60000, retries: 0 });
      const mediaId = media.data?.id || media.id || media.media_id_string;
      const tw = 'https://api.x.com/2/tweets';
      const text = [p.caption?.slice(0, 250), p.link].filter(Boolean).join('\n');
      const { data } = await httpJson(tw, {
        method: 'POST',
        headers: { Authorization: oauthHeader('POST', tw, c), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, media: { media_ids: [String(mediaId)] } }),
      }, { retries: 0 });
      return { id: data.data?.id, url: `https://x.com/i/status/${data.data?.id}` };
    },
  },
  telegram: {
    label: 'Telegram',
    fields: [['bot_token', 'Bot Token', true], ['chat_id', 'Channel Username / Chat ID', false]],
    async test(c) {
      const api = `https://api.telegram.org/bot${c.bot_token}`;
      const { data: me } = await httpJson(`${api}/getMe`, {}, { retries: 0 });
      const { data: chat } = await httpJson(`${api}/getChat?chat_id=${encodeURIComponent(c.chat_id)}`, {}, { retries: 0 });
      const { data: mem } = await httpJson(`${api}/getChatMember?chat_id=${encodeURIComponent(c.chat_id)}&user_id=${me.result.id}`, {}, { retries: 0 });
      const st = mem.result?.status;
      if (chat.result.type === 'channel' && st !== 'administrator') throw new Error('বটটি চ্যানেলের অ্যাডমিন নয়');
      return { info: `@${me.result.username} → ${chat.result.title || chat.result.username} (${st})` };
    },
    async publish(c, p) {
      const caption = [p.caption, p.link].filter(Boolean).join('\n\n').slice(0, 1024);
      const { data } = await httpJson(`https://api.telegram.org/bot${c.bot_token}/sendPhoto`, {
        method: 'POST', body: form({ chat_id: c.chat_id, caption }, { field: 'photo', buffer: p.buffer }),
      }, { timeout: 60000, retries: 0 });
      return { id: String(data.result.message_id) };
    },
  },
  whatsapp: {
    label: 'WhatsApp Business (Cloud API)',
    fields: [['phone_number_id', 'Phone Number ID', false], ['recipients', 'প্রাপক নম্বর (কমা দিয়ে)', false], ['access_token', 'Access Token', true]],
    async test(c) {
      const { data } = await httpJson(`${GRAPH}/${c.phone_number_id}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(c.access_token)}`);
      return { info: `${data.verified_name} (${data.display_phone_number}) — WhatsApp Channel-এ API পোস্ট সমর্থিত নয়; শুধু নির্দিষ্ট নম্বরে বার্তা যাবে` };
    },
    async publish(c, p) {
      needPublicUrl(p.imageUrl, 'WhatsApp');
      const to = String(c.recipients || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!to.length) throw new Error('প্রাপক নম্বর দেওয়া নেই');
      const ids = [];
      for (const num of to) {
        // Outside a 24-hour customer window Meta only delivers approved template messages
        const { data } = await httpJson(`${GRAPH}/${c.phone_number_id}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'image', image: { link: p.imageUrl, caption: [p.caption, p.link].filter(Boolean).join('\n').slice(0, 1024) } }),
        }, { retries: 0 });
        ids.push(data.messages?.[0]?.id);
      }
      return { id: ids.join(',') };
    },
  },
  tiktok: {
    label: 'TikTok',
    fields: [['client_key', 'Client Key', true], ['client_secret', 'Client Secret', true], ['access_token', 'Access Token', true]],
    async test(c) {
      const { data } = await httpJson('https://open.tiktokapis.com/v2/user/info/?fields=display_name', { headers: { Authorization: `Bearer ${c.access_token}` } }, { retries: 0 });
      return { info: `${data.data?.user?.display_name} — ছবি পোস্টের জন্য TikTok অ্যাপ অডিট ও ভেরিফাইড ডোমেইন লাগে` };
    },
    async publish(c, p) {
      needPublicUrl(p.imageUrl, 'TikTok');
      const { data } = await httpJson('https://open.tiktokapis.com/v2/post/publish/content/init/', {
        method: 'POST', headers: { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_info: { title: p.caption?.slice(0, 90), description: p.caption?.slice(0, 2000), privacy_level: 'PUBLIC_TO_EVERYONE' },
          source_info: { source: 'PULL_FROM_URL', photo_images: [p.imageUrl], photo_cover_index: 0 },
          post_mode: 'DIRECT_POST', media_type: 'PHOTO',
        }),
      }, { retries: 0 });
      if (data.error?.code && data.error.code !== 'ok') throw new Error(data.error.message);
      return { id: data.data?.publish_id };
    },
  },
  youtube: {
    label: 'YouTube',
    fields: [['channel_id', 'YouTube Channel ID', false], ['access_token', 'OAuth Access Token', true]],
    async test(c) {
      const { data } = await httpJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${c.access_token}` } }, { retries: 0 });
      return { info: `${data.items?.[0]?.snippet?.title || 'চ্যানেল'} — YouTube API কমিউনিটি/ছবি পোস্ট সমর্থন করে না` };
    },
    async publish() { throw new UnsupportedError('YouTube Data API দিয়ে ছবি বা কমিউনিটি পোস্ট প্রকাশ সমর্থিত নয় (শুধু ভিডিও আপলোড)।'); },
  },
  webhook: {
    label: 'Webhook (Zapier / Make / n8n)',
    fields: [['url', 'Webhook URL', true]],
    async test(c) {
      const r = await http(c.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) }, { retries: 0 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { info: `HTTP ${r.status}` };
    },
    async publish(c, p) {
      const r = await http(c.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: p.imageUrl, caption: p.caption, link: p.link }) }, { retries: 0 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { id: `http-${r.status}` };
    },
  },
};
