// server/src/routes/students-optimized.ts
// Optimized student endpoints with pagination and projections

import { Router, Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../db/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { rowToObject } from '../utils/sql.js';

const router = Router();
const STUDENT_LIST_COLUMNS = `
  s.id,
  s.admission_no,
  s.student_id,
  s.first_name,
  s.last_name,
  s.gender,
  s.class_id,
  s.guardian_name,
  s.guardian_phone,
  s.guardian_email,
  s.photo_url,
  s.status,
  s.created_at,
  s.updated_at,
  c.name as class_name
`;

const SORT_COLUMNS: Record<string, string> = {
  created_at: 's.created_at',
  first_name: 's.first_name',
  last_name: 's.last_name',
  admission_no: 's.admission_no',
  student_id: 's.student_id',
  class_id: 's.class_id',
};

function getSortClause(sortBy: unknown, sortOrder: unknown) {
  const column = SORT_COLUMNS[String(sortBy || 'created_at')] || SORT_COLUMNS.created_at;
  const direction = String(sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return `${column} ${direction}, s.id ${direction}`;
}

function mapRows(result: any[]) {
  return result.length > 0
    ? result[0].values.map(row => rowToObject(result[0].columns, row))
    : [];
}

/**
 * GET /api/students/paginated
 * Query params: page=1, pageSize=20, sortBy=firstName, sortOrder=asc
 * Returns only paginated results, not entire dataset
 */
router.get('/paginated', authenticateToken, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const sortClause = getSortClause(req.query.sortBy, req.query.sortOrder);

    const db = getDatabase();

    // Get total count efficiently
    const countResult = db.exec('SELECT COUNT(*) as count FROM students');
    const total = Number(countResult[0]?.values[0]?.[0]) || 0;

    // Get paginated page results
    const offset = (page - 1) * pageSize;
    const result = db.exec(
      `SELECT ${STUDENT_LIST_COLUMNS}
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       ORDER BY ${sortClause}
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    const students = mapRows(result);

    res.json({
      success: true,
      data: {
        items: students,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

/**
 * GET /api/students/cursor
 * Cursor pagination for very large lists. Cursor is a base64 JSON object:
 * { "createdAt": "2026-01-01T00:00:00.000Z", "id": "..." }
 */
router.get('/cursor', authenticateToken, (req: Request, res: Response) => {
  try {
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    let cursor: { createdAt?: string; id?: string } | null = null;

    if (typeof req.query.cursor === 'string' && req.query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid cursor' });
      }
    }

    const where: string[] = [];
    const params: any[] = [];
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (classId) {
      where.push('s.class_id = ?');
      params.push(classId);
    }
    if (cursor?.createdAt && cursor?.id) {
      where.push('(s.created_at < ? OR (s.created_at = ? AND s.id < ?))');
      params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDatabase();
    const result = db.exec(
      `SELECT ${STUDENT_LIST_COLUMNS}
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       ${whereSql}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ?`,
      [...params, pageSize + 1]
    );

    const rows = mapRows(result);
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const last = items[items.length - 1] as any;
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url')
      : null;

    res.json({ success: true, data: { items, nextCursor, hasMore } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

/**
 * GET /api/students/search
 * Query params: q=search_term, page=1, pageSize=20
 * Full-text search with pagination
 */
router.get('/search', authenticateToken, (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

    if (query.length < 2) {
      return res.json({ success: true, data: { items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } } });
    }

    const db = getDatabase();
    const searchTerm = `${query.trim().replace(/["']/g, '')}*`;
    const likeTerm = `%${query}%`;

    // Count matching results
    const countResult = db.exec(
      `SELECT COUNT(*) as count FROM students
       WHERE first_name LIKE ? OR last_name LIKE ? OR admission_no LIKE ? OR student_id LIKE ? OR guardian_phone LIKE ?`,
      [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm]
    );
    const total = Number(countResult[0]?.values[0]?.[0]) || 0;

    // Get paginated results
    const offset = (page - 1) * pageSize;
    let students: Record<string, any>[] = [];
    try {
      const result = db.exec(
        `SELECT ${STUDENT_LIST_COLUMNS}
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         WHERE s.rowid IN (
           SELECT rowid FROM students_fts WHERE students_fts MATCH ?
         )
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
        [searchTerm, pageSize, offset]
      );
      students = mapRows(result);
    } catch {
      students = [];
    }

    if (students.length === 0) {
      const fallback = db.exec(
        `SELECT ${STUDENT_LIST_COLUMNS}
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         WHERE s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR s.student_id LIKE ? OR s.guardian_phone LIKE ?
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
        [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, pageSize, offset]
      );
      students = mapRows(fallback);
    }

    res.json({
      success: true,
      data: {
        items: students,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        query,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * POST /api/students/batch-create
 * Create multiple students in one transaction
 * Much faster than individual creates
 */
router.post('/batch-create', authenticateToken, (req: Request, res: Response) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: 'Records array required' });
    }

    const db = getDatabase();
    const now = new Date().toISOString();
    let created = 0;
    let failed = 0;

    // Wrap in transaction for atomicity
    db.run('BEGIN TRANSACTION');

    try {
      for (const record of records) {
        try {
          db.run(
            `INSERT INTO students (id, admission_no, first_name, last_name, gender, class_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [record.id, record.admissionNo, record.firstName, record.lastName, record.gender, record.classId, 'active', now, now]
          );
          created++;
        } catch (e) {
          failed++;
        }
      }

      db.run('COMMIT');
      saveDatabase();

      res.json({
        success: true,
        data: { created, failed, total: records.length },
      });
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Batch create failed' });
  }
});

/**
 * PUT /api/students/batch-update
 * Update multiple students efficiently
 */
router.put('/batch-update', authenticateToken, (req: Request, res: Response) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: 'Records array required' });
    }

    const db = getDatabase();
    const now = new Date().toISOString();
    let updated = 0;
    let failed = 0;

    db.run('BEGIN TRANSACTION');

    try {
      for (const record of records) {
        try {
          db.run(
            `UPDATE students SET first_name = ?, last_name = ?, class_id = ?, status = ?, updated_at = ?
             WHERE id = ?`,
            [record.firstName, record.lastName, record.classId, record.status || 'active', now, record.id]
          );
          updated++;
        } catch (e) {
          failed++;
        }
      }

      db.run('COMMIT');
      saveDatabase();

      res.json({
        success: true,
        data: { updated, failed, total: records.length },
      });
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Batch update failed' });
  }
});

/**
 * POST /api/students/batch-delete
 * Delete multiple students efficiently
 */
router.post('/batch-delete', authenticateToken, (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'IDs array required' });
    }

    const db = getDatabase();
    let deleted = 0;

    db.run('BEGIN TRANSACTION');

    try {
      for (const id of ids) {
        try {
          db.run('DELETE FROM students WHERE id = ?', [id]);
          deleted++;
        } catch (e) {
          // Continue with next
        }
      }

      db.run('COMMIT');
      saveDatabase();

      res.json({
        success: true,
        data: { deleted, total: ids.length },
      });
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Batch delete failed' });
  }
});

/**
 * GET /api/students/by-class/:classId
 * Get students for a class (with index)
 */
router.get('/by-class/:classId', authenticateToken, (req: Request, res: Response) => {
  try {
    const classId = req.params.classId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));

    const db = getDatabase();

    // Use index on class_id
    const countResult = db.exec(
      'SELECT COUNT(*) as count FROM students WHERE class_id = ?',
      [classId]
    );
    const total = Number(countResult[0]?.values[0]?.[0]) || 0;

    const offset = (page - 1) * pageSize;
    const result = db.exec(
      `SELECT ${STUDENT_LIST_COLUMNS}
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.class_id = ?
       ORDER BY s.first_name ASC
       LIMIT ? OFFSET ?`,
      [classId, pageSize, offset]
    );

    const students = mapRows(result);

    res.json({
      success: true,
      data: {
        items: students,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch class students' });
  }
});

export default router;
