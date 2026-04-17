import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/init.js';
import { asSqlString, getStringParam, isIsoDateString, rowToObject } from '../utils/sql.js';

const router = Router();
const changeColumnCache = new Map<string, string | null>();

function getChangeTrackingColumn(db: ReturnType<typeof getDatabase>, table: string): string | null {
  const cached = changeColumnCache.get(table);
  if (cached !== undefined) {
    return cached;
  }

  const pragmaResult = db.exec(`PRAGMA table_info(${table})`);
  if (pragmaResult.length === 0 || pragmaResult[0].values.length === 0) {
    changeColumnCache.set(table, null);
    return null;
  }

  const columns = pragmaResult[0].values.map(row => String(row[1]).toLowerCase());
  const trackedColumn = ['updated_at', 'created_at', 'synced_at']
    .find(column => columns.includes(column)) ?? null;

  changeColumnCache.set(table, trackedColumn);
  return trackedColumn;
}

router.post('/:table', async (req: Request, res: Response) => {
  try {
    const { table } = req.params;
    const data = req.body;
    console.log(`Sync create: ${table}`, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

router.put('/:table', async (req: Request, res: Response) => {
  try {
    const { table } = req.params;
    const data = req.body;
    console.log(`Sync update: ${table}`, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

router.delete('/:table/:id', async (req: Request, res: Response) => {
  try {
    const { table, id } = req.params;
    console.log(`Sync delete: ${table}/${id}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

router.get('/changes', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const changes: Record<string, any[]> = {};
    const tables = ['students', 'staff', 'classes', 'subjects', 'fees', 'payments', 'attendance', 'announcements'];
    const since = getStringParam(req.query.since);
    const safeSince = since && isIsoDateString(since) ? since : '1970-01-01T00:00:00.000Z';

    for (const table of tables) {
      const changeTrackingColumn = getChangeTrackingColumn(db, table);
      if (!changeTrackingColumn) {
        changes[table] = [];
        continue;
      }

      const result = db.exec(`SELECT * FROM ${table} WHERE ${changeTrackingColumn} > ${asSqlString(safeSince)}`);
      changes[table] = result.length > 0
        ? result[0].values.map(row => rowToObject(result[0].columns, row))
        : [];
    }

    res.json({ success: true, data: changes });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch changes' });
  }
});

export default router;
