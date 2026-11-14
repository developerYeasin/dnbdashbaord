import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const UPLOAD_DIR = path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const OK = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Only JPG/PNG/WebP; the file name is random and the extension is derived from the MIME type
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${OK[file.mimetype]}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_, file, cb) => (OK[file.mimetype] ? cb(null, true) : cb(new Error('শুধু JPG, PNG বা WebP ছবি আপলোড করা যাবে'))),
});

export const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 }, fileFilter: (_, f, cb) => (OK[f.mimetype] ? cb(null, true) : cb(new Error('শুধু JPG, PNG বা WebP ছবি'))) });

export const fileUrl = f => (f ? `/uploads/${f.filename}` : null);

// verify magic bytes so a renamed file cannot pass as an image
export function looksLikeImage(file) {
  const b = fs.readFileSync(file.path).subarray(0, 12);
  const ok = (b[0] === 0xff && b[1] === 0xd8) || b.subarray(0, 4).toString('hex') === '89504e47' || (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP');
  if (!ok) fs.rmSync(file.path, { force: true });
  return ok;
}
export function saveBuffer(buf, ext = '.png') {
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
