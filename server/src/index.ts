import express from 'express';
import cors from 'cors';
import { initDatabase, seedDatabase } from './db/init.js';
import { authenticateToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/students.js';
import staffRoutes from './routes/staff.js';
import classRoutes from './routes/classes.js';
import subjectRoutes from './routes/subjects.js';
import attendanceRoutes from './routes/attendance.js';
import financeRoutes from './routes/finance.js';
import transportRoutes from './routes/transport.js';
import announcementRoutes from './routes/announcements.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import syncRoutes from './routes/sync.js';

const app = express();
const PORT = process.env.PORT || 3334;
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4201,http://127.0.0.1:4201')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // In development, allow all origins for local network testing
    if (!origin || process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/students', authenticateToken, studentRoutes);
app.use('/api/staff', authenticateToken, staffRoutes);
app.use('/api/classes', authenticateToken, classRoutes);
app.use('/api/subjects', authenticateToken, subjectRoutes);
app.use('/api/attendance', authenticateToken, attendanceRoutes);
app.use('/api/finance', authenticateToken, financeRoutes);
app.use('/api/transport', authenticateToken, transportRoutes);
app.use('/api/announcements', authenticateToken, announcementRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/sync', authenticateToken, syncRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  try {
    await initDatabase();
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
