import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { drawMainCard, drawTextCard, drawOpeningCard, alphaBBox, SIZE } from '../../../shared/cards.js';
import { http, assertPublicUrl } from './http.js';

const FONT_DIR = path.resolve('fonts');
for (const f of fs.existsSync(FONT_DIR) ? fs.readdirSync(FONT_DIR) : []) {
  if (/\.(ttf|otf)$/i.test(f)) GlobalFonts.registerFromPath(path.join(FONT_DIR, f), 'Hind Siliguri');
}

export const CARD_DIR = path.resolve('uploads', 'cards');
fs.mkdirSync(CARD_DIR, { recursive: true });

// Load from /uploads/... (local) or http(s) (remote, SSRF-checked). Returns null on failure:
// a broken image becomes a placeholder on the card instead of failing the whole render.
export async function loadAny(src) {
  if (!src) return null;
  try {
    if (src.startsWith('/uploads/')) return await loadImage(fs.readFileSync(path.resolve('.' + src)));
    await assertPublicUrl(src);
    const res = await http(src, {}, { timeout: 20000, retries: 1 });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function renderCard(kind, settings, { image, logo, ad, bg } = {}) {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  const [img, lg, adImg, bgImg] = await Promise.all([loadAny(image), settings.logoMode === 'image' ? loadAny(settings.logoUrl || logo) : null, loadAny(ad), loadAny(bg)]);
  if (kind === 'main') drawMainCard(ctx, settings, { image: img, logo: lg, ad: adImg });
  else if (kind === 'opening') drawOpeningCard(ctx, settings, { image: img, logo: lg, ad: adImg, bbox: img ? alphaBBox(img, createCanvas) : null });
  else drawTextCard(ctx, settings, { logo: lg, ad: adImg, bg: bgImg });
  return c.encode('jpeg', 92);
}

export function saveCard(buf, name) {
  const file = `${Date.now()}-${name.replace(/[^\w-]/g, '').slice(0, 40) || 'card'}.jpg`;
  fs.writeFileSync(path.join(CARD_DIR, file), buf);
  return `/uploads/cards/${file}`;
}

// Re-encode an image as JPEG under maxKB (used for WordPress featured images, limit 100 KB)
export async function compressJpeg(buffer, maxKB = 100, maxW = 1280) {
  const img = await loadImage(buffer);
  let w = Math.min(maxW, img.width);
  for (let attempt = 0; attempt < 6; attempt++) {
    const h = Math.round(img.height * (w / img.width));
    const c = createCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    for (const qual of [82, 72, 62, 52, 42]) {
      const out = await c.encode('jpeg', qual);
      if (out.length <= maxKB * 1024) return out;
    }
    w = Math.round(w * 0.8);
  }
  throw new Error(`ছবি ${maxKB}KB-এর নিচে নামানো যায়নি`);
}
