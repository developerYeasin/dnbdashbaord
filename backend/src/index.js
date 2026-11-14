import './boot.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { initDb } from './db.js';
import { requireAuth, h } from './auth.js';
import { startScheduler, tick } from './services/scheduler.js';
import authRoutes from './routes/auth.js';
import wpRoutes, { webhook } from './routes/wp.js';
import cardRoutes from './routes/cards.js';
import adRoutes from './routes/ads.js';
import channelRoutes from './routes/channels.js';
import aiRoutes from './routes/ai.js';
import { bulletins, staff, logs, admin } from './routes/misc.js';

for (const k of ['JWT_SECRET', 'APP_KEY', 'DB_HOST', 'DB_NAME']) {
  if (!process.env[k]) { console.error(`Missing ${k} in backend/.env`); process.exit(1); }
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use('/api/admin/restore', express.json({ limit: '60mb' }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.resolve('uploads'), { maxAge: '7d', dotfiles: 'deny' }));

app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhook);
// cPanel cron: curl -s https://YOUR-DOMAIN/api/cron/<CRON_KEY>  (every minute)
app.get('/api/cron/:key', h(async (req, res) => {
  const a = Buffer.from(String(req.params.key)), b = Buffer.from(process.env.CRON_KEY || '');
  if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'forbidden' });
  res.json(await tick('cron'));
}));

app.use('/api/wp', requireAuth, wpRoutes);
app.use('/api/cards', requireAuth, cardRoutes);
app.use('/api/ads', requireAuth, adRoutes);
app.use('/api/channels', requireAuth, channelRoutes);
app.use('/api/bulletins', requireAuth, bulletins);
app.use('/api/staff', requireAuth, staff);
app.use('/api/logs', requireAuth, logs);
app.use('/api/admin', requireAuth, admin);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api', (_, res) => res.status(404).json({ error: 'API পাওয়া যায়নি' }));

// Serve the built React app (single Node app on cPanel)
const dist = path.resolve('..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && process.env.NODE_ENV === 'production' ? 'সার্ভার ত্রুটি — লগ দেখুন' : err.message });
});

const PORT = process.env.PORT || 5050;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`DN Bangla dashboard backend on :${PORT}`));
    if (process.env.DISABLE_INTERNAL_CRON !== '1') startScheduler();
  })
  .catch(e => {
    console.error('DB init failed:', e.message);
    process.exit(1);
  });
