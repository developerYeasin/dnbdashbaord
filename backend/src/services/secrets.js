import { q, one } from '../db.js';
import { encrypt, decrypt, mask, isMask } from '../crypto.js';

export async function getSecret(k) {
  const r = await one('SELECT v FROM secrets WHERE k=?', [k]);
  return r ? decrypt(r.v) : '';
}
// A masked value coming back from the UI means "unchanged"
export async function setSecret(k, v) {
  if (v === undefined || isMask(v)) return;
  if (v === '') await q('DELETE FROM secrets WHERE k=?', [k]);
  else await q('INSERT INTO secrets (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, encrypt(v)]);
}
export async function maskedSecret(k) {
  return mask(await getSecret(k));
}
