import { Router, Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../db/init.js';
import { asSqlString, getStringParam, rowToObject } from '../utils/sql.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const date = getStringParam(req.query.date);
    const entityType = getStringParam(req.query.entityType);
    const entityId = getStringParam(req.query.entityId);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
    const paged = req.query.paged === '1' || req.query.page !== undefined || req.query.pageSize !== undefined;
    const where: string[] = [];
    const params: any[] = [];
    if (date) {
      where.push('date = ?');
      params.push(date);
    }
    if (entityType) {
      where.push('entity_type = ?');
      params.push(entityType);
    }
    if (entityId) {
      where.push('entity_id = ?');
      params.push(entityId);
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const limitSql = paged ? ' ORDER BY date DESC LIMIT ? OFFSET ?' : ' ORDER BY date DESC';
    const queryParams = paged ? [...params, pageSize, (page - 1) * pageSize] : params;

    const result = db.exec(`SELECT * FROM attendance${whereSql}${limitSql}`, queryParams);
    const attendance = result.length > 0
      ? result[0].values.map(row => rowToObject(result[0].columns, row))
      : [];
    if (paged) {
      const count = Number(db.exec(`SELECT COUNT(*) FROM attendance${whereSql}`, params)[0]?.values[0]?.[0] || 0);
      return res.json({
        success: true,
        data: {
          items: attendance,
          pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) },
        },
      });
    }
    res.json({ success: true, data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch attendance' });
  }
});

router.post('/students', (req: Request, res: Response) => {
  try {
    const { date, records } = req.body;
    const db = getDatabase();
    const now = new Date().toISOString();

    for (const record of records) {
      db.run(`DELETE FROM attendance WHERE entity_type = 'student' AND entity_id = ${asSqlString(record.entityId)} AND date = ${asSqlString(date)}`);
      db.run('INSERT INTO attendance (id, entity_type, entity_id, date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), 'student', record.entityId, date, record.status, now]);
    }

    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save attendance' });
  }
});

router.post('/staff', (req: Request, res: Response) => {
  try {
    const { date, records } = req.body;
    const db = getDatabase();
    const now = new Date().toISOString();

    for (const record of records) {
      db.run(`DELETE FROM attendance WHERE entity_type = 'staff' AND entity_id = ${asSqlString(record.entityId)} AND date = ${asSqlString(date)}`);
      db.run('INSERT INTO attendance (id, entity_type, entity_id, date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), 'staff', record.entityId, date, record.status, now]);
    }

    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save attendance' });
  }
});

export default router;
