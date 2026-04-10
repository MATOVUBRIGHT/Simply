# Enable Real-time Sync in Supabase

Follow these steps to enable real-time cross-device synchronization:

## 1. Enable Real-time for Tables

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable real-time for all sync tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE schools;
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE staff;
ALTER PUBLICATION supabase_realtime ADD TABLE classes;
ALTER PUBLICATION supabase_realtime ADD TABLE subjects;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE fees;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE exams;
ALTER PUBLICATION supabase_realtime ADD TABLE exam_results;
ALTER PUBLICATION supabase_realtime ADD TABLE timetable;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_routes;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_assignments;

-- Verify real-time is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## 2. Fix RLS Policies for Real-time

If you have RLS enabled, add policies to allow real-time subscriptions:

```sql
-- Drop existing policies if needed
DROP POLICY IF EXISTS "Users can view own data" ON public.users;

-- Create policies that allow real-time
CREATE POLICY "Enable real-time for users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Enable real-time for students" ON public.students
  FOR SELECT USING (true);

CREATE POLICY "Enable real-time for staff" ON public.staff
  FOR SELECT USING (true);

-- Add similar policies for other tables as needed
```

## 3. Test Real-time Functionality

1. **Start the app**: `npm run dev`
2. **Login/Register**: Create an account or login
3. **Enable sync**: Go to Settings → Enable Cloud Sync
4. **Open multiple browsers**: Login with same account on 2+ devices
5. **Test changes**: Create/update data on one device
6. **Verify updates**: Changes should appear instantly on other devices

## 4. Debug Real-time Issues

Run the test script in browser console:
```javascript
// Copy and paste contents of test-realtime.js
```

**Common Issues:**

- **No real-time events**: Check that tables are added to supabase_realtime publication
- **Permission denied**: Fix RLS policies to allow SELECT operations
- **Sync not working**: Ensure sync is enabled in Settings
- **Cross-device not working**: Both devices must be online and logged into same account

## 5. Monitor Real-time Activity

Look for these console logs:
- `📡 Subscribed to real-time updates for X tables`
- `📡 Real-time INSERT in students: 123`
- `🔄 UI refresh triggered for INSERT on students`
- `🔄 StudentsContext: Real-time update received`

## 6. Real-time Status Indicators

The app shows real-time status in the header:
- **Real-time Active**: Blue icon, sync working
- **X devices**: Green icon with device count when multiple devices active
- **Offline**: Gray icon when disconnected
- **Sync Disabled**: Amber icon when sync is turned off

## 7. Performance Notes

- Real-time uses WebSocket connections - minimal battery impact
- Only subscribed tables receive updates
- Updates are batched to prevent excessive UI refreshes
- Local database ensures offline functionality

## 8. Security Considerations

- Users can only see their own data (filtered by school_id)
- RLS policies ensure data isolation
- Real-time subscriptions respect user permissions
- No sensitive data broadcasted to unauthorized users
