// AES-256-GCM encryption for API tokens/passwords stored in the database.
// The key lives only in the server .env (APP_KEY), never in the DB or the browser.
import crypto from 'crypto';

function key() {
  const k = process.env.APP_KEY || '';
  if (k.length < 32) throw new Error('APP_KEY must be set in backend/.env (at least 32 characters)');
  return crypto.createHash('sha256').update(k).digest();
}

export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  if (!blob) return '';
  try {
    const [iv, tag, data] = blob.split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// What the browser sees instead of a secret
export const mask = v => (v ? `••••••${String(v).slice(-4)}` : '');
export const isMask = v => typeof v === 'string' && v.startsWith('••••••');
