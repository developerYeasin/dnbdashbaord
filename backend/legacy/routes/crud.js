import { Router } from 'express';
import { q } from '../db.js';
import { upload, fileUrl } from '../upload.js';

/** Generic CRUD router. fileFields = columns that receive uploaded images (multipart). */
export function crud(table, fields, { fileFields = [], where = '', order = 'id DESC', router = Router() } = {}) {
  const mw = fileFields.length ? upload.fields(fileFields.map(name => ({ name, maxCount: 1 }))) : (req, res, next) => next();

  const pick = req => {
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f] === '' ? null : req.body[f];
    for (const f of fileFields) if (req.files?.[f]?.[0]) data[f] = fileUrl(req.files[f][0]);
    return data;
  };

  router.get('/', async (req, res, next) => {
    try {
      const filters = Object.entries(req.query).filter(([k]) => fields.includes(k));
      const cond = [where, ...filters.map(([k]) => `${k}=?`)].filter(Boolean).join(' AND ');
      res.json(await q(`SELECT * FROM ${table} ${cond ? `WHERE ${cond}` : ''} ORDER BY ${order}`, filters.map(f => f[1])));
    } catch (e) { next(e); }
  });

  router.get('/:id(\\d+)', async (req, res, next) => {
    try {
      const [row] = await q(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
      row ? res.json(row) : res.status(404).json({ error: 'Not found' });
    } catch (e) { next(e); }
  });

  router.post('/', mw, async (req, res, next) => {
    try {
      const r = await q(`INSERT INTO ${table} SET ?`, [pick(req)]);
      const [row] = await q(`SELECT * FROM ${table} WHERE id=?`, [r.insertId]);
      res.json(row);
    } catch (e) { next(e); }
  });

  router.put('/:id(\\d+)', mw, async (req, res, next) => {
    try {
      const data = pick(req);
      if (Object.keys(data).length) await q(`UPDATE ${table} SET ? WHERE id=?`, [data, req.params.id]);
      const [row] = await q(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
      res.json(row);
    } catch (e) { next(e); }
  });

  router.delete('/:id(\\d+)', async (req, res, next) => {
    try {
      await q(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
