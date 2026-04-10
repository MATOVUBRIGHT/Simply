# Mobile Real-time Sync Testing Guide

## 🚀 Quick Start

### 1. Start the Mobile-Friendly Server
```bash
npm run dev:mobile
```

This will start the server with network access and display all available URLs for mobile devices.

### 2. Connect Mobile Devices
- Ensure mobile devices are on the same WiFi network
- Open any of the displayed URLs on mobile browsers
- Login with the same account across all devices

## 📱 Testing Scenarios

### Real-time Data Sync Tests

#### 1. **Students Sync**
- **Device A**: Create a new student
- **Device B**: Student appears instantly
- **Device A**: Update student information
- **Device B**: Changes reflect immediately
- **Device A**: Delete student
- **Device B**: Student disappears from list

#### 2. **Staff/Teachers Sync**
- **Device A**: Add new teacher
- **Device B**: Teacher appears in staff list and teachers card
- **Device A**: Update teacher salary
- **Device B**: Updated salary shows in payroll card

#### 3. **Classes Sync**
- **Device A**: Create new class
- **Device B**: Class appears in class filter dropdown
- **Device A**: Delete class
- **Device B**: Students with that class show "Not assigned"

#### 4. **Payroll Sync**
- **Device A**: Generate payroll for current month
- **Device B**: Payroll stats update immediately
- **Device A**: Mark payment as paid
- **Device B**: Payment status changes to "paid"

## 🔍 Debugging Tools

### Browser Console Tests
Run these scripts in browser console:

#### Real-time Sync Test
```javascript
// Copy contents of test-realtime.js
```

#### Class Assignment Test
```javascript
// Copy contents of test-class-assignments.js
```

### Network Monitoring
1. Open **Network tab** in browser dev tools
2. Look for **WebSocket** connections
3. Filter by **WS** to see real-time messages
4. Check for **postgres_changes** events

### Console Logs to Watch
- `📡 Subscribed to real-time updates`
- `📡 Real-time INSERT in students`
- `🔄 UI refresh triggered`
- `🔄 StudentsContext: Real-time update received`

## 🛠 Troubleshooting

### Common Issues & Solutions

#### **Mobile Device Can't Connect**
- ✅ Check WiFi connection (same network as computer)
- ✅ Try different IP address from the list
- ✅ Disable VPN on mobile device
- ✅ Check firewall settings on computer

#### **Real-time Not Working**
- ✅ Check Supabase real-time is enabled
- ✅ Verify RLS policies allow subscriptions
- ✅ Look for WebSocket errors in console
- ✅ Ensure sync is enabled in Settings

#### **Data Not Syncing**
- ✅ Check internet connection on both devices
- ✅ Verify same user account on both devices
- ✅ Look for "📡" logs in console
- ✅ Check real-time status indicator in header

#### **Class Assignment Issues**
- ✅ Click "Check Classes" button
- ✅ Verify classes exist in Classes page
- ✅ Check for "Not assigned" labels

## 📊 Performance Monitoring

### Real-time Status Indicator
The header shows connection status:
- **Real-time Active** (blue) - Working normally
- **2 devices** (green) - Multiple devices connected
- **Offline** (gray) - No internet connection
- **Sync Disabled** (amber) - Sync turned off

### Network Usage
- Real-time uses minimal data (~1KB per change)
- WebSocket connections are persistent
- Battery impact is minimal
- Works on 3G/4G/5G networks

## 🧪 Advanced Testing

### Cross-Platform Testing
Test on different mobile browsers:
- ✅ Chrome (Android)
- ✅ Safari (iOS)
- ✅ Firefox Mobile
- ✅ Samsung Internet

### Stress Testing
1. Create 10+ students rapidly
2. Switch between pages quickly
3. Test with poor network connection
4. Try simultaneous edits from multiple devices

### Edge Cases
1. **Network interruption**: Turn off WiFi, then back on
2. **App background**: Switch to other apps, return
3. **Multiple tabs**: Open same account in multiple browser tabs
4. **Logout/login**: Test session management

## 📋 Test Checklist

### Before Testing
- [ ] Server started with `npm run dev:mobile`
- [ ] Mobile devices on same WiFi
- [ ] Same account logged in on all devices
- [ ] Sync enabled in Settings

### Basic Functionality
- [ ] Students create/update/delete sync
- [ ] Staff add/update sync
- [ ] Classes create/delete sync
- [ ] Payroll generate/mark paid sync

### Real-time Features
- [ ] Instant updates across devices
- [ ] Real-time status indicator working
- [ ] Console logs showing events
- [ ] WebSocket connection established

### Error Handling
- [ ] Network disconnect/reconnect
- [ ] Invalid class assignments marked
- [ ] Orphaned records cleanup
- [ ] Conflict resolution

## 🎯 Success Criteria

✅ **Real-time sync works within 1-2 seconds**
✅ **All data types sync correctly**
✅ **Mobile devices can access the app**
✅ **No data loss during network issues**
✅ **UI updates automatically**
✅ **Status indicators accurate**

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify network connectivity
3. Run the test scripts
4. Check this guide for solutions

The real-time sync system should provide seamless data synchronization across all your devices!
