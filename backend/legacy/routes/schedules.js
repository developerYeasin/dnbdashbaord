import { Router } from 'express';
import { crud, wrap } from './crud.js';
import { q } from '../db.js';
import { runSchedule } from '../services/scheduler.js';

const r = Router();

// Run now (publish=false → only generate preview card)
r.post('/:id(\\d+)/run', wrap(async (req, res) => {
  const [s] = await q('SELECT * FROM schedules WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(await runSchedule(s, { publish: req.body.publish !== false }));
}));

// Content library: good_morning, health, history, birthday, weather_alert ...
r.use('/content', crud('content_library', ['kind', 'day_month', 'title', 'text'], { fileFields: ['image'], order: 'kind, day_month, id DESC' }));

crud('schedules', ['slot', 'kind', 'title', 'run_time', 'template_id', 'active'], { order: 'run_time', router: r });

export default r;
