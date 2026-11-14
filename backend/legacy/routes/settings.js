import { Router } from 'express';
import { q, getSettings } from '../db.js';
import { wrap } from './crud.js';

const r = Router();

r.get('/', wrap(async (req, res) => res.json(await getSettings())));

r.put('/', wrap(async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await q('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, v == null ? '' : String(v)]);
  }
  res.json(await getSettings());
}));

export default r;
