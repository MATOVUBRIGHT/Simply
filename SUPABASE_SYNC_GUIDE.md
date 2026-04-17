# Supabase User Sync Debugging Guide

## Problem: Users Not Added to Supabase

If users are being created locally but not appearing in Supabase, follow these steps:

### Step 1: Verify Supabase Credentials

Check that `.env` OR `.env.local` has valid credentials:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Missing or invalid credentials will silently skip Supabase sync.

### Step 2: Open Browser Console and Run Diagnostic

After the app loads, open browser DevTools (F12) and run:

```javascript
// Test 1: Basic connection
SupabaseDebug.testSupabaseConnection()

// Test 2: Check RLS policies
SupabaseDebug.checkRLSPolicies()

// Test 3: Verify schema
SupabaseDebug.checkDatabaseSchema()

// Test 4: Manual insert
SupabaseDebug.testUserInsert({
  id: 'manual-test-' + Date.now(),
  school_id: 'manual-test-' + Date.now(),
  email: 'test' + Date.now() + '@test.com',
  first_name: 'Test',
  last_name: 'User',
  is_active: true,
  role: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
})
```

### Step 3: Check Console Output

Look for these success messages:
- ✅ "Supabase connection successful!"
- ✅ "Insert successful!"

If you see error code **42501** or "permission denied", see RLS Policies section below.

### Step 4: Register a Test User

1. Navigate to `/login`
2. Click "Register"
3. Fill in details:
   - Email: `testuser@example.com`
   - Password: `Test@1234`
   - First Name: `Test`
   - Last Name: `User`
4. Click "Register"

Watch console for these logs:
```
🔄 Starting Supabase sync for user: testuser@example.com
📤 Attempting insert to users table...
✅ User successfully inserted to Supabase!
```

### Step 5: Verify in Supabase Dashboard

1. Open https://app.supabase.com
2. Select your project
3. Go to **Table Editor** > **users**
4. Look for your test user with email `testuser@example.com`

If user is NOT there, go to **RLS Policies** section below.

---

## RLS Policies Issue (Error 42501)

If you see "42501 permission denied" error:

### Quick Fix (Development Only)

1. Go to Supabase Dashboard
2. Click **SQL Editor** in left sidebar
3. Copy-paste and run:

```sql
-- Disable RLS on users table for development
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
```

4. Reload your app and try registering again

### Proper Fix (Production Ready)

Create a policy allowing users to insert:

```sql
-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow anonymous insert
CREATE POLICY "Allow anonymous insert" ON public.users
  FOR INSERT
  WITH CHECK (true);

-- Allow users to view their own data
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT
  USING (auth.uid() = id);
```

---

## Common Issues & Solutions

### Issue: "Supabase not configured"
**Cause:** Environment variables not set
**Solution:** Create `.env.local` in `/client` with valid credentials

### Issue: "Supabase client is null"
**Cause:** Credentials not loaded
**Solution:** Restart dev server after adding `.env.local`

### Issue: "Error code 42501"
**Cause:** RLS policies blocking anonymous insert
**Solution:** Disable RLS or add permission policies (see section above)

### Issue: "Duplicate key value"
**Cause:** User already exists in Supabase
**Solution:** Use different email or delete user from Supabase

### Issue: Users deleted moments after creation
**Cause:** Syncing isn't actually working; users only exist locally
**Solution:** Follow debugging steps above to verify sync is working

---

## Testing Sync Directly

Open browser console and run:

```javascript
// Create a test user in Supabase directly
SupabaseDebug.testUserInsert({
  id: 'direct-test-' + Date.now(),
  school_id: 'direct-test-' + Date.now(),
  email: 'direct@test.com',
  first_name: 'Direct',
  last_name: 'Test',
  is_active: true,
  role: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
})
```

If this works, Supabase connection is fine. If it fails, check RLS.

---

## Next Steps

Once users are syncing to Supabase:
1. Check browser console for warning messages
2. Review React DevTools for component state
3. Monitor Supabase dashboard for data consistency

For more help, check console logs for:
- `🔄` = Sync in progress
- `✅` = Success
- `❌` = Error
- `⚠️` = Warning
