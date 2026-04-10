#!/usr/bin/env node

/**
 * Development Server Launcher for Mobile Testing
 * Starts the Schofy app with network access for mobile devices
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

// Get network interfaces
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (!interface.internal && interface.family === 'IPv4') {
        ips.push({
          name: name,
          address: interface.address
        });
      }
    }
  }
  
  return ips;
}

// Get local IP address for mobile access
const networkIPs = getNetworkIPs();
const primaryIP = networkIPs.find(ip => ip.name.includes('Wi-Fi') || ip.name.includes('Ethernet')) || networkIPs[0];

console.log('🚀 Starting Schofy Development Server for Mobile Testing\n');
console.log('📱 Network Access Information:');
console.log('=====================================');

if (networkIPs.length > 0) {
  console.log('🌐 Available Network Interfaces:');
  networkIPs.forEach((ip, index) => {
    const isPrimary = ip === primaryIP;
    console.log(`   ${index + 1}. ${ip.name}: ${ip.address} ${isPrimary ? '(PRIMARY)' : ''}`);
  });
  
  console.log('\n📱 Mobile Device Access URLs:');
  console.log('=====================================');
  networkIPs.forEach(ip => {
    console.log(`   http://${ip.address}:4201`);
  });
  
  console.log('\n💻 Local Access:');
  console.log(`   http://localhost:4201`);
  
} else {
  console.log('⚠️  No network interfaces found. Using localhost only.');
  console.log(`   http://localhost:4201`);
}

console.log('\n🔧 Testing Instructions:');
console.log('=====================================');
console.log('1. Make sure your mobile device is on the same WiFi network');
console.log('2. Open one of the URLs above on your mobile device');
console.log('3. Login with the same account on multiple devices');
console.log('4. Test real-time sync by creating/updating data');
console.log('5. Check browser console for real-time event logs');

console.log('\n📊 Real-time Sync Testing:');
console.log('=====================================');
console.log('• Students: Create/update student on one device');
console.log('• Staff: Add teacher on one device, check on another');
console.log('• Classes: Create class, see it appear on other devices');
console.log('• Payroll: Generate payroll, check status across devices');

console.log('\n🛠  Debug Tools:');
console.log('=====================================');
console.log('• Run test-realtime.js in browser console');
console.log('• Check Network tab for WebSocket connections');
console.log('• Look for "📡" logs in console');
console.log('• Verify real-time status indicator in header');

console.log('\n⏳ Starting server...\n');

// Start the development server
const devProcess = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

// Handle process exit
devProcess.on('close', (code) => {
  console.log(`\n📋 Development server exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development server...');
  devProcess.kill('SIGINT');
  process.exit(0);
});

// Handle errors
devProcess.on('error', (error) => {
  console.error('❌ Failed to start development server:', error.message);
  console.log('\n💡 Troubleshooting:');
  console.log('• Make sure Node.js is installed');
  console.log('• Run "npm install" in the project root');
  console.log('• Check if port 4201 is already in use');
  process.exit(1);
});
