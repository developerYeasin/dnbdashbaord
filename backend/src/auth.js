import jwt from 'jsonwebtoken';

export function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role || 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'লগইন প্রয়োজন' });
  }
}

// Settings, API keys, staff deletion, log clearing, backup: admin only
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'শুধু অ্যাডমিন এই কাজ করতে পারবেন' });
  next();
}

// wraps async route handlers so thrown errors reach the error middleware
export const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
