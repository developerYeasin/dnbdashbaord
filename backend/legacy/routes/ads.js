import { Router } from 'express';
import { crud } from './crud.js';

const r = Router();
r.use('/groups', crud('ad_groups', ['name', 'current_index', 'active']));
r.use('/banners', crud('ad_banners', ['group_id', 'title', 'sort_order', 'active'], { fileFields: ['image'], order: 'group_id, sort_order, id' }));

export default r;
