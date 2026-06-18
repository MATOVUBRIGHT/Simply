import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../db/init.js';
import { rowToObject } from '../utils/sql.js';

const router = Router();

function getPage(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function rows(result: any[]) {
  return result.length > 0 ? result[0].values.map(row => rowToObject(result[0].columns, row)) : [];
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM academic_year_archives ORDER BY academic_year DESC');
    res.json({ success: true, data: rows(result) });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch archives' });
  }
});

router.post('/:academicYear/archive', (req: Request, res: Response) => {
  const academicYear = req.params.academicYear;
  if (!/^\d{4}$/.test(academicYear)) {
    return res.status(400).json({ success: false, error: 'Academic year must be a four digit year' });
  }

  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    db.run('BEGIN TRANSACTION');

    const attendanceCount = Number(db.exec('SELECT COUNT(*) FROM attendance WHERE substr(date, 1, 4) = ?', [academicYear])[0]?.values[0]?.[0] || 0);
    const feeCount = Number(db.exec('SELECT COUNT(*) FROM fees WHERE year = ?', [academicYear])[0]?.values[0]?.[0] || 0);
    const paymentCount = Number(db.exec('SELECT COUNT(*) FROM payments WHERE substr(date, 1, 4) = ?', [academicYear])[0]?.values[0]?.[0] || 0);

    db.run(`
      INSERT OR REPLACE INTO academic_year_archives
      (id, academic_year, status, archived_at, record_counts, created_at, updated_at)
      VALUES (
        COALESCE((SELECT id FROM academic_year_archives WHERE academic_year = ?), ?),
        ?,
        'archived',
        ?,
        ?,
        COALESCE((SELECT created_at FROM academic_year_archives WHERE academic_year = ?), ?),
        ?
      )
    `, [
      academicYear,
      uuidv4(),
      academicYear,
      now,
      JSON.stringify({ attendance: attendanceCount, fees: feeCount, payments: paymentCount }),
      academicYear,
      now,
      now,
    ]);

    db.run(`
      INSERT OR IGNORE INTO attendance_archive
      (id, entity_type, entity_id, date, status, remarks, academic_year, archived_at, created_at, synced_at)
      SELECT id, entity_type, entity_id, date, status, remarks, ?, ?, created_at, synced_at
      FROM attendance
      WHERE substr(date, 1, 4) = ?
    `, [academicYear, now, academicYear]);
    db.run('DELETE FROM attendance WHERE substr(date, 1, 4) = ?', [academicYear]);

    db.run(`
      INSERT OR IGNORE INTO fees_archive
      (id, student_id, class_id, description, amount, term, year, due_date, archived_at, created_at, synced_at)
      SELECT id, student_id, class_id, description, amount, term, year, due_date, ?, created_at, synced_at
      FROM fees
      WHERE year = ?
    `, [now, academicYear]);
    db.run('DELETE FROM fees WHERE year = ?', [academicYear]);

    db.run(`
      INSERT OR IGNORE INTO payments_archive
      (id, fee_id, student_id, amount, method, reference, date, received_by, academic_year, archived_at, created_at, synced_at)
      SELECT id, fee_id, student_id, amount, method, reference, date, received_by, ?, ?, created_at, synced_at
      FROM payments
      WHERE substr(date, 1, 4) = ?
    `, [academicYear, now, academicYear]);
    db.run('DELETE FROM payments WHERE substr(date, 1, 4) = ?', [academicYear]);

    db.run('COMMIT');
    saveDatabase();
    res.json({ success: true, data: { academicYear, attendanceCount, feeCount, paymentCount } });
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* ignore */ }
    res.status(500).json({ success: false, error: 'Archive failed' });
  }
});

router.post('/:academicYear/restore', (req: Request, res: Response) => {
  const academicYear = req.params.academicYear;
  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    db.run('BEGIN TRANSACTION');
    db.run(`
      INSERT OR IGNORE INTO attendance (id, entity_type, entity_id, date, status, remarks, created_at, synced_at)
      SELECT id, entity_type, entity_id, date, status, remarks, created_at, synced_at
      FROM attendance_archive
      WHERE academic_year = ?
    `, [academicYear]);
    db.run('DELETE FROM attendance_archive WHERE academic_year = ?', [academicYear]);

    db.run(`
      INSERT OR IGNORE INTO fees (id, student_id, class_id, description, amount, term, year, due_date, created_at, synced_at)
      SELECT id, student_id, class_id, description, amount, term, year, due_date, created_at, synced_at
      FROM fees_archive
      WHERE year = ?
    `, [academicYear]);
    db.run('DELETE FROM fees_archive WHERE year = ?', [academicYear]);

    db.run(`
      INSERT OR IGNORE INTO payments (id, fee_id, student_id, amount, method, reference, date, received_by, created_at, synced_at)
      SELECT id, fee_id, student_id, amount, method, reference, date, received_by, created_at, synced_at
      FROM payments_archive
      WHERE academic_year = ?
    `, [academicYear]);
    db.run('DELETE FROM payments_archive WHERE academic_year = ?', [academicYear]);

    db.run("UPDATE academic_year_archives SET status = 'restored', restored_at = ?, updated_at = ? WHERE academic_year = ?", [now, now, academicYear]);
    db.run('COMMIT');
    saveDatabase();
    res.json({ success: true, data: { academicYear } });
  } catch {
    try { db.run('ROLLBACK'); } catch { /* ignore */ }
    res.status(500).json({ success: false, error: 'Restore failed' });
  }
});

router.get('/:academicYear/:table', (req: Request, res: Response) => {
  const academicYear = req.params.academicYear;
  const table = req.params.table;
  const { page, pageSize, offset } = getPage(req);
  const tableMap: Record<string, { name: string; yearColumn: string; order: string }> = {
    attendance: { name: 'attendance_archive', yearColumn: 'academic_year', order: 'date DESC' },
    fees: { name: 'fees_archive', yearColumn: 'year', order: 'created_at DESC' },
    payments: { name: 'payments_archive', yearColumn: 'academic_year', order: 'date DESC' },
  };
  const config = tableMap[table];
  if (!config) return res.status(400).json({ success: false, error: 'Unsupported archive table' });

  try {
    const db = getDatabase();
    const total = Number(db.exec(`SELECT COUNT(*) FROM ${config.name} WHERE ${config.yearColumn} = ?`, [academicYear])[0]?.values[0]?.[0] || 0);
    const result = db.exec(
      `SELECT * FROM ${config.name} WHERE ${config.yearColumn} = ? ORDER BY ${config.order} LIMIT ? OFFSET ?`,
      [academicYear, pageSize, offset]
    );
    res.json({
      success: true,
      data: {
        items: rows(result),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch archive records' });
  }
});

export default router;
