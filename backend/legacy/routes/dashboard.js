import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from './crud.js';

const r = Router();

r.get('/', wrap(async (req, res) => {
  const [totals] = await q(`SELECT COUNT(*) total,
      SUM(DATE(created_at)=CURDATE()) today,
      SUM(status='published') published, SUM(status IN ('failed','partial')) failed
    FROM posts`);
  const bySource = await q(`SELECT SUBSTRING_INDEX(source,':',1) source, COUNT(*) c FROM posts GROUP BY 1`);
  const last7 = await q(`SELECT DATE(created_at) d, COUNT(*) c FROM posts WHERE created_at >= CURDATE() - INTERVAL 6 DAY GROUP BY 1 ORDER BY 1`);
  const [accounts] = await q('SELECT COUNT(*) c FROM social_accounts WHERE active=1');
  const [sites] = await q('SELECT COUNT(*) c FROM websites WHERE active=1');
  const [members] = await q('SELECT COUNT(*) c FROM members');
  const recent = await q('SELECT * FROM posts ORDER BY id DESC LIMIT 10');
  res.json({ totals, bySource, last7, accounts: accounts.c, websites: sites.c, members: members.c, recent });
}));

export default r;
