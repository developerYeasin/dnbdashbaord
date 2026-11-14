import { q, getSetting, patchSetting } from '../db.js';

// Active ads whose campaign window includes today, in display order
export async function activeAds() {
  return q(`SELECT * FROM ads WHERE active=1
    AND (start_date IS NULL OR start_date <= CURDATE()) AND (end_date IS NULL OR end_date >= CURDATE())
    ORDER BY sort_order, id`);
}

// Cycle: 1st new card -> ad 1, 2nd -> ad 2 ... wraps forever, independently per card kind.
export async function peekAd(kind) {
  const list = await activeAds();
  if (!list.length) return null;
  const cyc = await getSetting('ad_cycle', {});
  return list[(cyc[kind] || 0) % list.length];
}
export async function takeAd(kind) {
  const list = await activeAds();
  if (!list.length) return null;
  const cyc = await getSetting('ad_cycle', {});
  const n = cyc[kind] || 0;
  const ad = list[n % list.length];
  await patchSetting('ad_cycle', { [kind]: n + 1 });
  await q('UPDATE ads SET shown_count = shown_count + 1 WHERE id=?', [ad.id]);
  return ad;
}
