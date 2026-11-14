import { Router } from 'express';
import { crud, wrap } from './crud.js';
import { q, getSettings } from '../db.js';
import { renderCard, renderIdCard } from '../services/photocard.js';

const r = Router();

// Make this template the default of its type
r.post('/:id(\\d+)/default', wrap(async (req, res) => {
  const [t] = await q('SELECT type FROM templates WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).end();
  await q('UPDATE templates SET is_default=(id=?) WHERE type=?', [req.params.id, t.type]);
  res.json({ ok: true });
}));

// Preview PNG with sample content
r.get('/:id(\\d+)/preview', wrap(async (req, res) => {
  const [t] = await q('SELECT * FROM templates WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).end();
  const s = await getSettings();
  let buf;
  if (t.type === 'idcard') {
    buf = await renderIdCard({ name: 'Md. Sample Name', name_bn: 'মোঃ নমুনা নাম', designation: 'Senior Reporter', employee_id: 'DNB-001', department: 'News', phone: '01700000000', blood_group: 'B+' }, t, s.brand_name);
  } else {
    const [banner] = t.ad_group_id ? await q('SELECT * FROM ad_banners WHERE group_id=? AND active=1 LIMIT 1', [t.ad_group_id]) : [];
    buf = await renderCard({
      template: t,
      mode: t.type === 'news' ? 'news' : 'text',
      title: req.query.title || (t.type === 'news' ? 'এখানে সংবাদের শিরোনাম দেখাবে — নমুনা হেডলাইন টেক্সট' : 'এখানে টিগার বা কমিউনিটি আপডেটের লেখা দেখাবে'),
      image: req.query.image || null,
      adBanner: banner,
      brand: s.brand_name,
    });
  }
  res.type('png').send(buf);
}));

crud('templates', ['type', 'name', 'width', 'height', 'bg_color', 'text_color', 'accent_color', 'bg_image', 'overlay_image', 'config', 'ad_group_id', 'is_default', 'active'], {
  fileFields: ['bg_image', 'overlay_image'],
  order: 'type, is_default DESC, id DESC',
  router: r,
});

export default r;
