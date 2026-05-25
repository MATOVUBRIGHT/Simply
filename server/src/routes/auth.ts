import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase, saveDatabase } from '../db/init.js';
import { getJwtSecret } from '../middleware/auth.js';
import { asSqlString, getStringParam, rowToObject } from '../utils/sql.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = getStringParam(email)?.toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const db = getDatabase();
    const result = db.exec(`SELECT * FROM users WHERE email = ${asSqlString(normalizedEmail)}`);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const userObj = rowToObject(result[0].columns, result[0].values[0]);

    if (!bcrypt.compareSync(password, userObj.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: userObj.id, role: userObj.role }, getJwtSecret(), { expiresIn: '7d' });

    const { password_hash, ...userWithoutPassword } = userObj;

    res.json({
      success: true,
      data: {
        token,
        user: userWithoutPassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

router.post('/register', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = getStringParam(email)?.toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const db = getDatabase();
    const existing = db.exec(`SELECT id FROM users WHERE email = ${asSqlString(normalizedEmail)}`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    const defaultRole = 'user';
    db.run('INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, normalizedEmail, hashedPassword, defaultRole, now, now]);
    saveDatabase();

    const token = jwt.sign({ userId: id, role: defaultRole }, getJwtSecret(), { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        token,
        user: { id, email: normalizedEmail, role: defaultRole, created_at: now, updated_at: now },
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.get('/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };

    const db = getDatabase();
    const result = db.exec(`SELECT id, email, role, created_at, updated_at FROM users WHERE id = ${asSqlString(decoded.userId)}`);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = rowToObject(result[0].columns, result[0].values[0]);

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export default router;
