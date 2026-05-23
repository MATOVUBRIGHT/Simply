# Schofy - School Management System

A full-stack school management system with offline-first architecture and desktop app support.

## Features

- **Student Management** - Add, edit, track students with profiles
- **Staff Management** - Manage teachers and staff
- **Attendance Tracking** - Daily student and staff attendance
- **Finance Module** - Fee structure, invoices, payments
- **Transport Management** - Bus routes and assignments
- **Academic Management** - Classes, subjects, exams
- **Announcements** - School-wide announcements
- **Reports** - PDF/CSV export capabilities
- **Offline Support** - Works without internet
- **Auto Sync** - Syncs when connection is restored
- **Theme Support** - Light/Dark mode with color customization
- **Desktop App** - Installable Electron application

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, Lucide Icons
- **Backend**: Node.js, Express, SQLite
- **Offline Storage**: IndexedDB (Dexie.js)
- **Desktop**: Electron
- **Charts**: Recharts

## Installation

```bash
# Install dependencies
npm install

# Start development (both client and server)
npm run dev

# Build for production
npm run build

# Run desktop app
npm run electron
```

## Project Structure

```
schofy/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   ├── services/       # API & sync services
│   │   └── db/             # IndexedDB setup
│   └── electron/           # Electron main process
├── server/                 # Express backend
│   └── src/
│       ├── routes/         # API routes
│       └── db/             # SQLite setup
└── shared/                 # Shared types
```

## API Endpoints

### Authentication
- POST `/api/auth/login` - User login
- POST `/api/auth/register` - User registration
- GET `/api/auth/me` - Get current user

### Students
- GET `/api/students` - List all students
- POST `/api/students` - Create student
- GET `/api/students/:id` - Get student
- PUT `/api/students/:id` - Update student
- DELETE `/api/students/:id` - Delete student

### Staff
- GET `/api/staff` - List all staff
- POST `/api/staff` - Create staff
- PUT `/api/staff/:id` - Update staff
- DELETE `/api/staff/:id` - Delete staff

### Finance
- GET `/api/finance/structure` - Fee structure
- POST `/api/finance/invoices` - Create invoice
- GET `/api/finance/payments` - List payments
- POST `/api/finance/payments` - Record payment

### Attendance
- GET `/api/attendance` - Get attendance records
- POST `/api/attendance/students` - Mark student attendance
- POST `/api/attendance/staff` - Mark staff attendance

## Sync Logic

The system uses a queue-based sync mechanism:

1. All data changes are written to local IndexedDB first
2. Changes are added to a sync queue with timestamps
3. When online, queued changes are pushed to the server
4. The server responds with any remote changes
5. Changes are merged using last-write-wins conflict resolution

## Development

```bash
# Start server only
npm run dev:server

# Start client only
npm run dev:client

```

## License

MIT
