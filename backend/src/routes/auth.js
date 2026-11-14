import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { q, one } from '../db.js';
import { sign, requireAuth, requireAdmin, h } from '../auth.js';
import * as L from '../log.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, message: { error: 'অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন' } });

r.post('/login', limiter, h(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await one('SELECT * FROM users WHERE email=?', [String(email || '').trim()]);
  if (!u || !(await bcrypt.compare(String(password || ''), u.password))) {
    await L.warn('auth', `ব্যর্থ লগইন: ${String(email).slice(0, 80)} (${req.ip})`);
    return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  }
  await L.info('auth', `লগইন: ${u.email}`);
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

r.get('/me', requireAuth, (req, res) => res.json(req.user));

r.post('/password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || next.length < 8) return res.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষর' });
  const u = await one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!(await bcrypt.compare(String(current || ''), u.password))) return res.status(400).json({ error: 'বর্তমান পাসওয়ার্ড ভুল' });
  await q('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(next, 10), u.id]);
  await L.info('auth', `পাসওয়ার্ড পরিবর্তন: ${u.email}`);
  res.json({ ok: true });
}));

r.get('/users', requireAuth, requireAdmin, h(async (_, res) => res.json(await q('SELECT id,name,email,role,created_at FROM users ORDER BY id'))));
r.post('/users', requireAuth, requireAdmin, h(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!email || !password || password.length < 8) return res.status(400).json({ error: 'ইমেইল ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন' });
  await q('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)', [name || email, email, await bcrypt.hash(password, 10), role === 'admin' ? 'admin' : 'editor']);
  await L.info('auth', `নতুন ব্যবহারকারী: ${email} (${role}) — ${req.user.email}`);
  res.json({ ok: true });
}));
r.delete('/users/:id', requireAuth, requireAdmin, h(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'নিজেকে মুছতে পারবেন না' });
  await q('DELETE FROM users WHERE id=?', [req.params.id]);
  await L.info('auth', `ব্যবহারকারী মুছে ফেলা #${req.params.id} — ${req.user.email}`);
  res.json({ ok: true });
}));
export default r;
