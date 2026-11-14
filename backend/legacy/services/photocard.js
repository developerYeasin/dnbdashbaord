import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../upload.js';

// Put any Bangla .ttf (e.g. NotoSansBengali, SolaimanLipi, Hind Siliguri) in backend/fonts/
const FONT_DIR = path.resolve('fonts');
if (fs.existsSync(FONT_DIR)) {
  for (const f of fs.readdirSync(FONT_DIR)) {
    if (/\.(ttf|otf)$/i.test(f)) GlobalFonts.registerFromPath(path.join(FONT_DIR, f), 'CardFont');
  }
}
const FONT = `CardFont, "Noto Sans Bengali", "Nirmala UI", "Vrinda", sans-serif`;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBn = s => String(s).replace(/\d/g, d => BN_DIGITS[d]);
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export const bnDate = (d = new Date()) => `${toBn(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`;

// Load from /uploads/..., absolute path, or http(s) URL
export async function loadAny(src) {
  if (!src) return null;
  try {
    if (/^https?:\/\//.test(src)) {
      const r = await fetch(src);
      if (!r.ok) return null;
      return await loadImage(Buffer.from(await r.arrayBuffer()));
    }
    const p = src.startsWith('/uploads/') ? path.join(UPLOAD_DIR, src.replace('/uploads/', '')) : src;
    return fs.existsSync(p) ? await loadImage(p) : null;
  } catch {
    return null;
  }
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

// Draw text block, shrinking font until it fits in maxH
function fitText(ctx, text, x, y, maxW, maxH, startSize, weight = 'bold', align = 'left', vcenter = align === 'center') {
  let size = startSize;
  let lines;
  for (; size > 18; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length * size * 1.35 <= maxH) break;
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const totalH = lines.length * size * 1.35;
  let cy = vcenter ? y + (maxH - totalH) / 2 : y;
  const ax = align === 'center' ? x + maxW / 2 : x;
  for (const l of lines) {
    ctx.fillText(l, ax, cy);
    cy += size * 1.35;
  }
  ctx.textAlign = 'left';
}

function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * mode: 'news' (photo + headline) | 'text' (only text) | 'list' (numbered lines)
 */
export async function renderCard({ template, mode = 'news', title = '', body = '', image, lines = [], adBanner, brand = 'DNB News', heading }) {
  const W = template.width || 1080;
  const H = template.height || 1080;
  const ad = adBanner ? await loadAny(adBanner.image) : null;
  const adH = ad ? Math.round((ad.height / ad.width) * W) : 0;

  const canvas = createCanvas(W, H + adH);
  const ctx = canvas.getContext('2d');
  const accent = template.accent_color || '#e63946';
  const fg = template.text_color || '#ffffff';

  ctx.fillStyle = template.bg_color || '#0b2545';
  ctx.fillRect(0, 0, W, H);
  const bg = await loadAny(template.bg_image);
  if (bg) cover(ctx, bg, 0, 0, W, H);

  const pad = Math.round(W * 0.05);

  if (mode === 'news') {
    const photoH = Math.round(H * 0.58);
    const photo = await loadAny(image);
    if (photo) cover(ctx, photo, 0, 0, W, photoH);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, W, photoH);
    }
    // brand tag
    ctx.fillStyle = accent;
    ctx.fillRect(pad, photoH - 30, W * 0.32, 60);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 32px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(brand, pad + 20, photoH);
    ctx.fillStyle = fg;
    fitText(ctx, title, pad, photoH + 60, W - pad * 2, H - photoH - 150, 64);
  } else if (mode === 'text') {
    ctx.fillStyle = accent;
    ctx.fillRect(pad, pad, 12, 90);
    ctx.fillStyle = fg;
    ctx.font = `bold 44px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(heading || brand, pad + 32, pad + 18);
    fitText(ctx, title || body, pad, pad + 150, W - pad * 2, H - pad * 2 - 260, 72, 'bold', 'center');
  } else if (mode === 'list') {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 60px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(heading || title, W / 2, 75);
    ctx.textAlign = 'left';
    const avail = H - 150 - 140;
    const rowH = Math.min(avail / Math.max(lines.length, 1), 110);
    lines.forEach((l, i) => {
      const y = 180 + i * rowH;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(pad + 28, y + rowH / 2, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 28px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toBn(i + 1), pad + 28, y + rowH / 2);
      ctx.textAlign = 'left';
      ctx.fillStyle = fg;
      fitText(ctx, l, pad + 75, y + 6, W - pad * 2 - 75, rowH - 12, Math.min(40, rowH * 0.45), '600', 'left', true);
    });
  }

  // footer: date + brand
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, H - 80, W, 80);
  ctx.fillStyle = '#fff';
  ctx.font = `500 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(bnDate(), pad, H - 40);
  ctx.textAlign = 'right';
  ctx.fillText(brand, W - pad, H - 40);
  ctx.textAlign = 'left';

  const overlay = await loadAny(template.overlay_image);
  if (overlay) ctx.drawImage(overlay, 0, 0, W, H);

  if (ad) ctx.drawImage(ad, 0, H, W, adH);

  return canvas.toBuffer('image/png');
}

export async function saveCard(buffer, prefix = 'card') {
  const dir = path.join(UPLOAD_DIR, 'cards');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${String(prefix).replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}-${Math.round(Math.random() * 1e5)}.png`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/cards/${name}`;
}

// ---------- ID card ----------
export async function renderIdCard(member, template, brand) {
  const W = 640, H = 1010;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const accent = template?.accent_color || '#0b6e4f';
  ctx.fillStyle = template?.bg_color || '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const bg = await loadAny(template?.bg_image);
  if (bg) cover(ctx, bg, 0, 0, W, H);
  else {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, 260);
    ctx.fillRect(0, H - 90, W, 90);
  }
  ctx.fillStyle = '#fff';
  ctx.font = `bold 46px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand, W / 2, 90);
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText('IDENTITY CARD', W / 2, 150);

  // photo circle
  const cx = W / 2, cy = 340, r = 140;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#ddd';
  ctx.fill();
  ctx.clip();
  const photo = await loadAny(member.photo);
  if (photo) cover(ctx, photo, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = template?.text_color || '#111';
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(member.name_bn || member.name || '', W / 2, 530);
  ctx.fillStyle = accent;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(member.designation || '', W / 2, 585);

  const rows = [
    ['ID', member.employee_id], ['Department', member.department], ['Phone', member.phone],
    ['Blood', member.blood_group], ['Email', member.email], ['Joined', member.join_date],
  ].filter(r => r[1]);
  ctx.textAlign = 'left';
  ctx.font = `500 26px ${FONT}`;
  rows.forEach(([k, v], i) => {
    const y = 650 + i * 44;
    ctx.fillStyle = '#666';
    ctx.fillText(k, 80, y);
    ctx.fillStyle = template?.text_color || '#111';
    ctx.fillText(`:  ${v}`, 250, y);
  });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(template?.config?.footer || 'If found, please return to the office', W / 2, H - 45);
  const overlay = await loadAny(template?.overlay_image);
  if (overlay) ctx.drawImage(overlay, 0, 0, W, H);
  return canvas.toBuffer('image/png');
}
