import { Router } from 'express';
import { crud, wrap } from './crud.js';
import { q, getSettings } from '../db.js';
import { renderIdCard } from '../services/photocard.js';
import { getTemplate } from '../services/pipeline.js';

const r = Router();

// Auto ID card PNG. ?template_id= to choose a custom ID card design
r.get('/:id(\\d+)/idcard', wrap(async (req, res) => {
  const [m] = await q('SELECT * FROM members WHERE id=?', [req.params.id]);
  if (!m) return res.status(404).end();
  const t = await getTemplate('idcard', req.query.template_id);
  if (typeof t.config === 'string') t.config = JSON.parse(t.config || '{}');
  const s = await getSettings();
  const buf = await renderIdCard(m, t, s.brand_name || 'DNB News');
  if (req.query.download) res.attachment(`idcard-${m.employee_id || m.id}.png`);
  res.type('png').send(buf);
}));

crud('members', ['employee_id', 'name', 'name_bn', 'designation', 'department', 'phone', 'email', 'blood_group', 'nid', 'dob', 'join_date', 'address', 'active'], {
  fileFields: ['photo'],
  router: r,
});

export default r;
