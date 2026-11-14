import { q } from './db.js';

// Remove anything that looks like a credential before it reaches the log table
const SECRET_KEYS = /token|secret|password|pass|key|authorization|signature/i;
export function scrub(v, depth = 0) {
  if (v == null || depth > 4) return v;
  if (typeof v === 'string') return v.replace(/(access_token|token|key|secret|password)=([^&\s"]+)/gi, '$1=***').replace(/bot\d+:[\w-]+/g, 'bot***');
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = SECRET_KEYS.test(k) ? '***' : scrub(x, depth + 1);
    return o;
  }
  return v;
}

export async function log(level, area, message, meta = null) {
  const msg = scrub(String(message)).slice(0, 2000);
  if (level === 'error') console.error(`[${area}] ${msg}`);
  try {
    await q('INSERT INTO logs (level, area, message, meta) VALUES (?,?,?,?)', [level, area, msg, meta ? JSON.stringify(scrub(meta)) : null]);
  } catch (e) {
    console.error('log write failed', e.message);
  }
}
export const info = (a, m, x) => log('info', a, m, x);
export const warn = (a, m, x) => log('warn', a, m, x);
export const error = (a, m, x) => log('error', a, m, x);
export const success = (a, m, x) => log('success', a, m, x);
