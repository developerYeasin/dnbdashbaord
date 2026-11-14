// Shared 1920x1920 photocard renderer.
// The same code draws the browser preview (HTML canvas) and the server output
// (@napi-rs/canvas), so the preview and the downloaded or auto-posted JPG always match.
// Every coordinate follows the DN Bangla design spec (top-left = 0,0, in px).

export const SIZE = 1920;
export const FONT = "'Hind Siliguri'";

export const GRADIENTS = {
  red: ['#B20710', '#0F172A'],
  slate: ['#334155', '#0B1224'],
  maroon: ['#840B0B', '#241018'],
  dark: ['#111827', '#030712'],
};

export const SOCIALS = ['facebook', 'x', 'threads', 'instagram', 'youtube', 'linkedin'];

// ---------- defaults ----------
const COMMON = {
  logoMode: 'text', // 'text' | 'image'
  logoUrl: '',
  brandA: 'ডিএন', brandB: 'বাংলা', brandAColor: '#DF202C', brandBColor: '#16763D',
  headerBg: '#FFFFFF', dateColor: '#111827',
  dateMode: 'auto', manualDate: '',
  footerOn: true, footerBg: '#1E293B', footerBorder: '#334155', footerText: '#F8FAFC',
  website: 'www.dnbangla.com.bd',
  social: { facebook: '', x: '', threads: '', instagram: '', youtube: '', linkedin: '' },
  adOn: true,
};

export const MAIN_DEFAULTS = {
  ...COMMON,
  categoryOn: true, category: '', categoryBg: '#E50914', categoryColor: '#FFFFFF',
  commentOn: true, commentText: 'বিস্তারিত কমেন্টে', commentBg: '#059669',
  headlineBg: '#840B0B', headlineColor: '#FFFFFF', headlineSize: 80, headlineMargin: 120,
  imageZoom: 1, imageFocusX: 0.5, imageFocusY: 0.5,
};

export const TEXT_DEFAULTS = {
  ...COMMON,
  gradient: 'red', customA: '#B20710', customB: '#0F172A',
  categoryOn: true, category: 'বিশেষ ঘোষণা', catBoxBg: 'rgba(255,255,255,0.15)', catBoxBorder: '', catColor: '#F59E0B',
  textSize: 75, textMargin: 225, textColor: '#FFFFFF',
};

export const OPENING_DEFAULTS = {
  ...COMMON,
  gradient: 'red', customA: '#B20710', customB: '#0F172A',
  imageSide: 'right', vAlign: 'center', offsetX: 0, offsetY: 0, scale: 1, rotation: 0, clipToArea: true,
  textWrap: true,
  textSize: 75, textColor: '#FFFFFF', textAlign: 'center',
};

// ---------- helpers ----------
export function bnDate(s = {}) {
  if (s.dateMode === 'manual' && s.manualDate) {
    // a free-text date, or a yyyy-mm-dd value from a date picker
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.manualDate)) return s.manualDate;
    return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(s.manualDate + 'T00:00:00Z'));
  }
  return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date());
}

const font = (size, weight = 700) => `${weight >= 600 ? 'bold' : weight >= 500 ? '500' : 'normal'} ${size}px ${FONT}`;

// Ellipsis-free fit: shrinks the font until the text fits maxW (used for single-line labels).
function fitSingle(ctx, text, size, weight, maxW, min = 18) {
  let s = size;
  ctx.font = font(s, weight);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = font(s, weight); }
  return s;
}

export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = line + ' ' + words[i];
      if (ctx.measureText(t).width <= maxW) line = t;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

// Wraps text and steps the font size down until every line fits the box.
// Never drops text; stops at a minimum readable size.
export function layoutText(ctx, text, { maxW, maxH, size, lh, weight = 700, min = 30 }) {
  let s = size;
  for (;;) {
    ctx.font = font(s, weight);
    const lines = wrapLines(ctx, text, maxW);
    const widest = Math.max(0, ...lines.map(l => ctx.measureText(l).width));
    const h = lines.length * s * lh;
    if ((h <= maxH && widest <= maxW) || s <= min) return { lines, size: s, height: h };
    s -= 2;
  }
}

function drawLines(ctx, layout, { x, w, top, lh, align, color, weight = 700 }) {
  ctx.font = font(layout.size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const step = layout.size * lh;
  layout.lines.forEach((l, i) => ctx.fillText(l, ax, top + step * i + step / 2));
  ctx.textBaseline = 'alphabetic';
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// object-fit: cover with an optional focus point and zoom
export function drawCover(ctx, img, x, y, w, h, { zoom = 1, fx = 0.5, fy = 0.5 } = {}) {
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih) * Math.max(1, zoom);
  const sw = w / scale, sh = h / scale;
  const sx = Math.min(Math.max(0, (iw - sw) * fx), iw - sw);
  const sy = Math.min(Math.max(0, (ih - sh) * fy), ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function placeholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 18]);
  ctx.strokeRect(x + 30, y + 30, w - 60, h - 60);
  ctx.setLineDash([]);
  ctx.fillStyle = '#9ca3af';
  ctx.font = font(Math.min(56, h / 4), 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

function gradientBg(ctx, s) {
  const [a, b] = s.gradient === 'custom' ? [s.customA, s.customB] : GRADIENTS[s.gradient] || GRADIENTS.red;
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

// Header: brand at x=60 / x=175 (baseline 58), date right-aligned at x=1860 (baseline 55)
function header(ctx, s, logo, h) {
  ctx.fillStyle = s.headerBg;
  ctx.fillRect(0, 0, SIZE, h);
  if (s.logoMode === 'image' && logo) {
    const lh = h - 20, lw = Math.min(700, (logo.width / logo.height) * lh);
    ctx.drawImage(logo, 60, 10 + (lh - lw * (logo.height / logo.width)) / 2, lw, lw * (logo.height / logo.width));
  } else {
    ctx.textAlign = 'left';
    ctx.font = font(48, 900);
    ctx.fillStyle = s.brandAColor;
    ctx.fillText(s.brandA, 60, 58);
    ctx.fillStyle = s.brandBColor;
    ctx.fillText(s.brandB, 175, 58);
  }
  const d = bnDate(s);
  fitSingle(ctx, d, 38, 600, 700);
  ctx.fillStyle = s.dateColor;
  ctx.textAlign = 'right';
  ctx.fillText(d, 1860, 55);
}

// ---------- social icons (drawn as vector shapes, 52x52) ----------
const ICON_BG = { facebook: '#1877F2', x: '#000000', threads: '#000000', instagram: '#E1306C', youtube: '#FF0000', linkedin: '#0A66C2' };

function socialIcon(ctx, name, x, y) {
  const S = 52, c = x + S / 2, m = y + S / 2;
  ctx.save();
  if (name === 'instagram') {
    const g = ctx.createLinearGradient(x, y + S, x + S, y);
    g.addColorStop(0, '#FEDA75'); g.addColorStop(0.4, '#D62976'); g.addColorStop(1, '#4F5BD5');
    ctx.fillStyle = g;
  } else ctx.fillStyle = ICON_BG[name];
  rrect(ctx, x, y, S, S, 12);
  ctx.fill();
  if (name === 'x' || name === 'threads') { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (name === 'facebook') {
    ctx.font = `bold 40px Arial, sans-serif`;
    ctx.fillText('f', c + 2, m + 4);
  } else if (name === 'x') {
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x + 15, y + 14); ctx.lineTo(x + 37, y + 38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 37, y + 14); ctx.lineTo(x + 15, y + 38); ctx.stroke();
  } else if (name === 'threads') {
    ctx.font = `bold 36px Arial, sans-serif`;
    ctx.fillText('@', c, m + 2);
  } else if (name === 'instagram') {
    ctx.lineWidth = 4;
    rrect(ctx, x + 12, y + 12, 28, 28, 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, m, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 34, y + 18, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (name === 'youtube') {
    ctx.beginPath(); ctx.moveTo(c - 8, m - 11); ctx.lineTo(c + 12, m); ctx.lineTo(c - 8, m + 11); ctx.closePath(); ctx.fill();
  } else if (name === 'linkedin') {
    ctx.font = `bold 28px Arial, sans-serif`;
    ctx.fillText('in', c, m + 2);
  }
  ctx.restore();
}

// Link bar: y=1563, h=77; website at x=64 (centre y=1601.5); icon group centred in its area
function footer(ctx, s) {
  if (!s.footerOn) return;
  ctx.fillStyle = s.footerBg;
  ctx.fillRect(0, 1563, SIZE, 77);
  ctx.strokeStyle = s.footerBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1564, SIZE - 2, 75);
  const site = (s.website || '').trim();
  if (site) {
    fitSingle(ctx, site, 30, 600, 500);
    ctx.fillStyle = s.footerText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(site, 64, 1601.5);
    ctx.textBaseline = 'alphabetic';
  }
  const icons = SOCIALS.filter(k => (s.social?.[k] || '').trim());
  if (!icons.length) return;
  const [a, b] = site ? [610, 1865] : [0, 1920];
  const total = icons.length * 52 + (icons.length - 1) * 42;
  let x = a + (b - a - total) / 2;
  for (const k of icons) { socialIcon(ctx, k, x, 1601.5 - 26); x += 94; }
}

// Ad banner: y=1640, 1920x280, cover
function adBanner(ctx, s, ad) {
  if (!s.adOn) return;
  if (ad) drawCover(ctx, ad, 0, 1640, SIZE, 280);
  else placeholder(ctx, 0, 1640, SIZE, 280, 'বিজ্ঞাপনের জায়গা');
}

// ---------- 1. Main news photocard ----------
export function drawMainCard(ctx, input, { image, logo, ad } = {}) {
  const s = { ...MAIN_DEFAULTS, ...input, social: { ...MAIN_DEFAULTS.social, ...(input?.social || {}) } };
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // feature image 0,80 1920x1085
  if (image) drawCover(ctx, image, 0, 80, SIZE, 1085, { zoom: s.imageZoom, fx: s.imageFocusX, fy: s.imageFocusY });
  else placeholder(ctx, 0, 80, SIZE, 1085, 'ফিচার ছবি নেই');

  header(ctx, s, logo, 80);

  // category badge x=60 y=130 h=70, width = text + 80 (max 1800), text at x=100 baseline 180
  const cat = (s.category || '').trim();
  if (s.categoryOn && cat) {
    const fs = fitSingle(ctx, cat, 36, 700, 1800 - 80);
    const w = Math.min(1800, ctx.measureText(cat).width + 80);
    ctx.fillStyle = s.categoryBg;
    ctx.fillRect(60, 130, w, 70);
    ctx.fillStyle = s.categoryColor;
    ctx.textAlign = 'left';
    ctx.font = font(fs, 700);
    ctx.fillText(cat, 100, 180);
  }

  // headline area 0,1165 1920x398
  ctx.fillStyle = s.headlineBg;
  ctx.fillRect(0, 1165, SIZE, 398);
  const margin = Math.min(450, Math.max(40, Number(s.headlineMargin)));
  const size = Math.min(120, Math.max(40, Number(s.headlineSize)));
  const maxW = SIZE - 2 * margin, pad = 20, maxH = 398 - pad * 2;
  const lay = layoutText(ctx, s.headline || 'শিরোনাম এখানে', { maxW, maxH, size, lh: 1.35, min: 32 });
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 1165, SIZE, 398); ctx.clip();
  drawLines(ctx, lay, { x: margin, w: maxW, top: 1165 + (398 - lay.height) / 2, lh: 1.35, align: 'center', color: s.headlineColor });
  ctx.restore();

  // "বিস্তারিত কমেন্টে" pill: h=55 at y=1100, centred, width = text + 70, r=27.5, 4px white border
  const ct = (s.commentText || '').trim();
  if (s.commentOn && ct) {
    const fs = fitSingle(ctx, ct, 32, 700, 1920 - 140);
    const w = ctx.measureText(ct).width + 70, x = (SIZE - w) / 2;
    rrect(ctx, x, 1100, w, 55, 27.5);
    ctx.fillStyle = s.commentBg; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = font(fs, 700);
    ctx.fillText(ct, SIZE / 2, 1138);
  }

  footer(ctx, s);
  adBanner(ctx, s, ad);
}

// ---------- 2. Text & trigger photocard ----------
export function drawTextCard(ctx, input, { logo, ad, bg } = {}) {
  const s = { ...TEXT_DEFAULTS, ...input, social: { ...TEXT_DEFAULTS.social, ...(input?.social || {}) } };
  ctx.clearRect(0, 0, SIZE, SIZE);
  gradientBg(ctx, s);
  if (bg) {
    // image bulletin: related photo, blurred ~30%, under a dark tint so the text stays readable
    ctx.save();
    ctx.filter = `blur(${Math.round((Number(s.bgBlur ?? 30) / 100) * 40)}px)`;
    drawCover(ctx, bg, -40, -40, SIZE + 80, SIZE + 80);
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${Number(s.bgDim ?? 0.45)})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  header(ctx, s, logo, 85);

  const cat = (s.category || '').trim();
  const hasCat = s.categoryOn && cat;
  if (hasCat) {
    ctx.fillStyle = s.catBoxBg;
    ctx.fillRect(100, 240, 1720, 90);
    if (s.catBoxBorder) { ctx.strokeStyle = s.catBoxBorder; ctx.lineWidth = 3; ctx.strokeRect(101.5, 241.5, 1717, 87); }
    const fs = fitSingle(ctx, cat, 42, 700, 1560);
    ctx.font = font(fs, 700);
    ctx.fillStyle = s.catColor;
    ctx.textAlign = 'center';
    ctx.fillText(cat, 960, 300);
  }

  const margin = Math.min(450, Math.max(80, Number(s.textMargin)));
  const size = Math.min(120, Math.max(40, Number(s.textSize)));
  const top = hasCat ? 350 : 85, bottom = 1563, maxW = SIZE - 2 * margin, maxH = bottom - top - 40;
  const lay = layoutText(ctx, s.text || 'মূল বার্তা লিখুন', { maxW, maxH, size, lh: 1.3, min: 32 });
  drawLines(ctx, lay, { x: margin, w: maxW, top: top + (bottom - top - lay.height) / 2, lh: 1.3, align: s.textAlign || 'center', color: s.textColor });

  footer(ctx, s);
  adBanner(ctx, s, ad);
}

// ---------- 3. Opening photocard (cut-out subject + text) ----------
const CONTENT = { top: 110, bottom: 1530, h: 1420 };
const COL = { left: 70, right: 990, w: 860 };

// bounding box of the non-transparent pixels, so a cut-out sits visually centred
export function alphaBBox(img, makeCanvas) {
  try {
    const w = Math.min(img.width, 600), h = Math.round(img.height * (w / img.width));
    const c = makeCanvas(w, h), x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      if (d[(y * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const k = img.width / w;
    return { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
  } catch { return null; }
}

// Where the cut-out lands on the canvas (used by the renderer and by drag handles in the UI)
export function openingImageRect(s, img, bbox) {
  const b = bbox || { x: 0, y: 0, w: img.width, h: img.height };
  const fit = Math.min(COL.w / b.w, CONTENT.h / b.h) * Math.max(0.2, Number(s.scale) || 1);
  const dw = b.w * fit, dh = b.h * fit;
  const colX = s.imageSide === 'left' ? COL.left : COL.right;
  let x = colX + (COL.w - dw) / 2;
  let y = s.vAlign === 'top' ? CONTENT.top : s.vAlign === 'bottom' ? CONTENT.bottom - dh : CONTENT.top + (CONTENT.h - dh) / 2;
  x += Number(s.offsetX) || 0;
  y += Number(s.offsetY) || 0;
  return { x, y, w: dw, h: dh, sx: b.x, sy: b.y, sw: b.w, sh: b.h };
}

export function drawOpeningCard(ctx, input, { image, logo, ad, bbox } = {}) {
  const s = { ...OPENING_DEFAULTS, ...input, social: { ...OPENING_DEFAULTS.social, ...(input?.social || {}) } };
  ctx.clearRect(0, 0, SIZE, SIZE);
  gradientBg(ctx, s);

  let r = null;
  if (image) {
    r = openingImageRect(s, image, bbox);
    ctx.save();
    if (s.clipToArea) { ctx.beginPath(); ctx.rect(0, CONTENT.top, SIZE, CONTENT.h); ctx.clip(); }
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate(((Number(s.rotation) || 0) * Math.PI) / 180);
    ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, -r.w / 2, -r.h / 2, r.w, r.h);
    ctx.restore();
  }

  // text column on the opposite side; with text-wrap on it also shrinks away from the image
  let tx = s.imageSide === 'left' ? COL.right : COL.left, tw = COL.w;
  if (r && s.textWrap) {
    const gap = 40;
    if (s.imageSide === 'right' && r.x - gap < tx + tw) tw = Math.max(360, r.x - gap - tx);
    if (s.imageSide === 'left' && r.x + r.w + gap > tx) { const nx = Math.min(1500, r.x + r.w + gap); tw = Math.max(360, tx + tw - nx); tx = nx; }
  }
  const size = Math.min(120, Math.max(40, Number(s.textSize)));
  const lay = layoutText(ctx, s.text || 'আপনার শিরোনাম', { maxW: tw, maxH: CONTENT.h, size, lh: 1.3, min: 32 });
  drawLines(ctx, lay, { x: tx, w: tw, top: CONTENT.top + (CONTENT.h - lay.height) / 2, lh: 1.3, align: s.textAlign, color: s.textColor });

  header(ctx, s, logo, 85);
  footer(ctx, s);
  adBanner(ctx, s, ad);
}
