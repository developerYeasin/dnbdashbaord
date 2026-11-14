import dns from 'dns/promises';
import net from 'net';

// fetch with timeout + limited retries on network errors / 5xx / 429
export async function http(url, opts = {}, { timeout = 20000, retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': 'DNBanglaDashboard/1.0', ...(opts.headers || {}) } });
      clearTimeout(t);
      if ((res.status >= 500 || res.status === 429) && i < retries) {
        await new Promise(r => setTimeout(r, 800 * 2 ** i));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e.name === 'AbortError' ? new Error(`সময়সীমা পেরিয়ে গেছে (${timeout / 1000}s): ${new URL(url).host}`) : e;
      if (i < retries) await new Promise(r => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw lastErr;
}

export async function httpJson(url, opts, cfg) {
  const res = await http(url, opts, cfg);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.description || data?.detail || data?.errors?.[0]?.message || data?.error || data?.raw || res.statusText;
    const e = new Error(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return { data, res };
}

// Blocks requests to internal addresses (SSRF guard for user-supplied URLs)
function privateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80') || ip.startsWith('::ffff:127.');
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
export async function assertPublicUrl(u) {
  let url;
  try { url = new URL(u); } catch { throw new Error('অবৈধ URL'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('শুধু http/https URL গ্রহণযোগ্য');
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('হোস্ট খুঁজে পাওয়া যায়নি: ' + url.hostname);
  if (addrs.some(a => privateIp(a.address))) throw new Error('অভ্যন্তরীণ নেটওয়ার্কের URL অনুমোদিত নয়');
  return url;
}
