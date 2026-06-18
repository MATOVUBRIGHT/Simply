import { Router, Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../db/init.js';
import { asSqlString, rowToObject } from '../utils/sql.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function getPaging(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
  const paged = req.query.paged === '1' || req.query.page !== undefined || req.query.pageSize !== undefined;
  return { page, pageSize, offset: (page - 1) * pageSize, paged };
}

function toRows(result: any[]) {
  return result.length > 0 ? result[0].values.map(row => rowToObject(result[0].columns, row)) : [];
}

router.get('/structure', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { page, pageSize, offset, paged } = getPaging(req);
    const term = typeof req.query.term === 'string' ? req.query.term : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const where: string[] = ['student_id IS NULL'];
    const params: any[] = [];
    if (term) {
      where.push('term = ?');
      params.push(term);
    }
    if (year) {
      where.push('year = ?');
      params.push(year);
    }
    if (classId) {
      where.push('class_id = ?');
      params.push(classId);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const result = db.exec(
      `SELECT * FROM fees ${whereSql} ORDER BY created_at DESC${paged ? ' LIMIT ? OFFSET ?' : ''}`,
      paged ? [...params, pageSize, offset] : params
    );
    const fees = toRows(result);
    if (paged) {
      const total = Number(db.exec(`SELECT COUNT(*) FROM fees ${whereSql}`, params)[0]?.values[0]?.[0] || 0);
      return res.json({ success: true, data: { items: fees, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } });
    }
    res.json({ success: true, data: fees });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch fees' });
  }
});

router.post('/structure', (req: Request, res: Response) => {
  try {
    const { description, amount, term, year, classId } = req.body;
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run('INSERT INTO fees (id, description, amount, term, year, class_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, description, amount, term, year, classId, now]);
    saveDatabase();

    const result = db.exec(`SELECT * FROM fees WHERE id = ${asSqlString(id)}`);
    res.json({ success: true, data: rowToObject(result[0].columns, result[0].values[0]) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create fee' });
  }
});

router.get('/invoices', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { page, pageSize, offset, paged } = getPaging(req);
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
    const term = typeof req.query.term === 'string' ? req.query.term : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    const where: string[] = ['f.student_id IS NOT NULL'];
    const params: any[] = [];
    if (studentId) {
      where.push('f.student_id = ?');
      params.push(studentId);
    }
    if (term) {
      where.push('f.term = ?');
      params.push(term);
    }
    if (year) {
      where.push('f.year = ?');
      params.push(year);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const result = db.exec(`
      SELECT f.*, s.first_name || ' ' || s.last_name as student_name, s.admission_no
      FROM fees f
      LEFT JOIN students s ON f.student_id = s.id
      ${whereSql}
      ORDER BY f.created_at DESC
      ${paged ? 'LIMIT ? OFFSET ?' : ''}
    `, paged ? [...params, pageSize, offset] : params);
    const invoices = toRows(result);
    if (paged) {
      const total = Number(db.exec(`SELECT COUNT(*) FROM fees f ${whereSql}`, params)[0]?.values[0]?.[0] || 0);
      return res.json({ success: true, data: { items: invoices, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } });
    }
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
  }
});

router.post('/invoices', (req: Request, res: Response) => {
  try {
    const { studentId, description, amount, term, year } = req.body;
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run('INSERT INTO fees (id, student_id, description, amount, term, year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, studentId, description, amount, term, year, now]);
    saveDatabase();

    const result = db.exec(`SELECT * FROM fees WHERE id = ${asSqlString(id)}`);
    res.json({ success: true, data: rowToObject(result[0].columns, result[0].values[0]) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create invoice' });
  }
});

router.get('/payments', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { page, pageSize, offset, paged } = getPaging(req);
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    const where: string[] = [];
    const params: any[] = [];
    if (studentId) {
      where.push('p.student_id = ?');
      params.push(studentId);
    }
    if (year) {
      where.push('substr(p.date, 1, 4) = ?');
      params.push(year);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = db.exec(`
      SELECT p.*, s.first_name || ' ' || s.last_name as student_name
      FROM payments p
      LEFT JOIN students s ON p.student_id = s.id
      ${whereSql}
      ORDER BY p.date DESC
      ${paged ? 'LIMIT ? OFFSET ?' : ''}
    `, paged ? [...params, pageSize, offset] : params);
    const payments = toRows(result);
    if (paged) {
      const total = Number(db.exec(`SELECT COUNT(*) FROM payments p ${whereSql}`, params)[0]?.values[0]?.[0] || 0);
      return res.json({ success: true, data: { items: payments, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } });
    }
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
});

router.post('/payments', (req: Request, res: Response) => {
  try {
    const { feeId, studentId, amount, method, reference } = req.body;
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run('INSERT INTO payments (id, fee_id, student_id, amount, method, reference, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, feeId, studentId, amount, method, reference, now, now]);
    saveDatabase();

    const result = db.exec(`SELECT * FROM payments WHERE id = ${asSqlString(id)}`);
    res.json({ success: true, data: rowToObject(result[0].columns, result[0].values[0]) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record payment' });
  }
});

router.get('/reports/collection', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const totalResult = db.exec('SELECT SUM(amount) as total FROM payments');
    const total = totalResult.length > 0 ? totalResult[0].values[0][0] || 0 : 0;
    const countResult = db.exec('SELECT COUNT(*) as count FROM payments');
    const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    res.json({ success: true, data: { total, count } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

export default router;
