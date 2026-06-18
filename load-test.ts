/**
 * Load Test Script for Schofy School Management System
 * Tests how many schools (users) the app can handle without errors
 */

/// <reference types="node" />


interface TestConfig {
  baseUrl: string;
  numSchools: number;
  studentsPerSchool: number;
  staffPerSchool: number;
  classesPerSchool: number;
}

interface TestResult {
  schoolId: number;
  email: string;
  token?: string;
  errors: string[];
  responseTimes: number[];
  avgResponseTime: number;
  success: boolean;
}

(async () => {
  const config: TestConfig = {
    baseUrl: 'http://localhost:3333/api',
    numSchools: 5, // Start with 5 schools, can increase
    studentsPerSchool: 10,
    staffPerSchool: 5,
    classesPerSchool: 3,
  };

  const timestamp = Date.now();
  const results: TestResult[] = [];

  async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function makeRequest(method: string, path: string, body?: any, token?: string) {
  const startTime = performance.now();
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      ...(body && { body: JSON.stringify(body) }),
    };

    const response = await fetch(`${config.baseUrl}${path}`, options);
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
    }

    return {
      data: responseData,
      responseTime,
      status: response.status,
    };
  } catch (error) {
    const endTime = performance.now();
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw {
      error: errorMsg,
      responseTime: endTime - startTime,
    };
  }
}

async function registerSchool(schoolNumber: number) {
  const email = `school${schoolNumber}_${timestamp}@test.com`;
  const password = `password${schoolNumber}`;

  try {
    const registerRes = await makeRequest('POST', '/auth/register', {
      email,
      password,
      fullName: `School ${schoolNumber}`,
      role: 'admin',
    });

    if (!registerRes.data.data || !registerRes.data.data.token) {
      throw new Error(`Invalid response structure: ${JSON.stringify(registerRes.data)}`);
    }

    return {
      email,
      password,
      userId: registerRes.data.data.user.id,
      token: registerRes.data.data.token,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Failed to register school ${schoolNumber}: ${errorMsg}`);
  }
}

async function loginSchool(email: string, password: string) {
  try {
    const response = await makeRequest('POST', '/auth/login', { email, password });
    return response.data.data.token;
  } catch (error) {
    throw new Error(`Failed to login ${email}: ${error}`);
  }
}

async function testSchoolOperations(schoolNumber: number, token: string, result: TestResult) {
  const operations = [];
  const responseTimes: number[] = [];

  try {
    // 1. Create classes
    console.log(`  [School ${schoolNumber}] Creating classes...`);
    for (let i = 0; i < config.classesPerSchool; i++) {
      try {
        const res = await makeRequest(
          'POST',
          '/classes',
          {
            name: `Class ${String.fromCharCode(65 + i)}`,
            level: i + 1,
            capacity: 40,
          },
          token,
        );
        responseTimes.push(res.responseTime);
      } catch (e) {
        result.errors.push(`Failed to create class ${i}: ${(e as any).error}`);
      }
      await sleep(50);
    }

    // 2. Create students
    console.log(`  [School ${schoolNumber}] Creating students...`);
    for (let i = 0; i < config.studentsPerSchool; i++) {
      try {
        const res = await makeRequest(
          'POST',
          '/students',
          {
            admissionNo: `ADM${schoolNumber}${String(i).padStart(4, '0')}`,
            firstName: `Student${i}`,
            lastName: `Test`,
            email: `student${schoolNumber}_${i}@test.com`,
            dob: '2010-01-01',
            guardianName: `Guardian ${i}`,
            guardianPhone: '1234567890',
          },
          token,
        );
        responseTimes.push(res.responseTime);
      } catch (e) {
        result.errors.push(`Failed to create student ${i}: ${(e as any).error}`);
      }
      await sleep(50);
    }

    // 3. Create staff
    console.log(`  [School ${schoolNumber}] Creating staff...`);
    for (let i = 0; i < config.staffPerSchool; i++) {
      try {
        const res = await makeRequest(
          'POST',
          '/staff',
          {
            employeeId: `EMP${schoolNumber}${String(i).padStart(4, '0')}`,
            firstName: `Staff${i}`,
            lastName: `Teacher`,
            email: `staff${schoolNumber}_${i}@test.com`,
            role: 'teacher',
            department: 'Academic',
            phone: '1234567890',
          },
          token,
        );
        responseTimes.push(res.responseTime);
      } catch (e) {
        result.errors.push(`Failed to create staff ${i}: ${(e as any).error}`);
      }
      await sleep(50);
    }

    // 4. Test read operations
    console.log(`  [School ${schoolNumber}] Testing read operations...`);
    const readOps = [
      { method: 'GET', path: '/students' },
      { method: 'GET', path: '/staff' },
      { method: 'GET', path: '/classes' },
      { method: 'GET', path: '/dashboard' },
    ];

    for (const op of readOps) {
      try {
        const res = await makeRequest(op.method, op.path, undefined, token);
        responseTimes.push(res.responseTime);
      } catch (e) {
        result.errors.push(`Failed GET ${op.path}: ${(e as any).error}`);
      }
      await sleep(100);
    }

    result.responseTimes = responseTimes;
    result.avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    result.success = result.errors.length === 0;

  } catch (error) {
    result.errors.push(`Test operations error: ${error}`);
    result.success = false;
  }
}

async function runLoadTest() {
  console.log('🚀 Starting Schofy Load Test\n');
  console.log(`Configuration:`);
  console.log(`  - Schools to test: ${config.numSchools}`);
  console.log(`  - Students per school: ${config.studentsPerSchool}`);
  console.log(`  - Staff per school: ${config.staffPerSchool}`);
  console.log(`  - Classes per school: ${config.classesPerSchool}\n`);

  // Health check
  console.log('⏳ Checking server health...');
  try {
    const healthRes = await fetch(`${config.baseUrl}/health`);
    if (!healthRes.ok) {
      console.error('❌ Server is not healthy. Make sure it\'s running on port 3333');
      process.exit(1);
    }
    console.log('✅ Server is healthy\n');
  } catch {
    console.error('❌ Cannot connect to server. Make sure it\'s running on port 3333');
    process.exit(1);
  }

  // Register and test schools
  console.log(`📝 Creating ${config.numSchools} test schools...\n`);

  for (let schoolNumber = 1; schoolNumber <= config.numSchools; schoolNumber++) {
    const result: TestResult = {
      schoolId: schoolNumber,
      email: `school${schoolNumber}_${timestamp}@test.com`,
      errors: [],
      responseTimes: [],
      avgResponseTime: 0,
      success: false,
    };

    try {
      console.log(`[${schoolNumber}/${config.numSchools}] Registering school ${schoolNumber}...`);
      
      const auth = await registerSchool(schoolNumber);
      result.email = auth.email;
      result.token = auth.token;

      console.log(`[${schoolNumber}/${config.numSchools}] Running operations for school ${schoolNumber}...`);
      await testSchoolOperations(schoolNumber, auth.token, result);

      console.log(`[${schoolNumber}/${config.numSchools}] ✅ School ${schoolNumber} completed`);
      console.log(`    - Errors: ${result.errors.length}`);
      console.log(`    - Avg Response Time: ${result.avgResponseTime.toFixed(2)}ms\n`);

    } catch (error) {
      result.errors.push(String(error));
      result.success = false;
      console.log(`[${schoolNumber}/${config.numSchools}] ❌ School ${schoolNumber} failed: ${error}\n`);
    }

    results.push(result);
    await sleep(500); // Rate limiting between schools
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 LOAD TEST RESULTS');
  console.log('='.repeat(60) + '\n');

  let totalErrors = 0;
  let successfulSchools = 0;
  let totalResponseTimes: number[] = [];

  results.forEach((result) => {
    totalErrors += result.errors.length;
    if (result.success) successfulSchools++;
    totalResponseTimes = totalResponseTimes.concat(result.responseTimes);

    const status = result.success ? '✅' : '❌';
    console.log(`${status} School ${result.schoolId} (${result.email})`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
      result.errors.slice(0, 3).forEach(err => console.log(`     - ${err}`));
      if (result.errors.length > 3) console.log(`     ... and ${result.errors.length - 3} more`);
    }
    console.log(`   Avg Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
    console.log();
  });

  console.log('='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Schools Tested: ${config.numSchools}`);
  console.log(`Successful Schools: ${successfulSchools}/${config.numSchools}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Overall Avg Response Time: ${(totalResponseTimes.reduce((a, b) => a + b, 0) / totalResponseTimes.length).toFixed(2)}ms`);
  console.log(`Min Response Time: ${Math.min(...totalResponseTimes).toFixed(2)}ms`);
  console.log(`Max Response Time: ${Math.max(...totalResponseTimes).toFixed(2)}ms`);
  console.log();

  if (successfulSchools === config.numSchools && totalErrors === 0) {
    console.log(`✅ ALL TESTS PASSED! Your app can handle ${config.numSchools} schools without errors.`);
    console.log(`\n💡 Try increasing numSchools in the config to find the limits!\n`);
  } else {
    console.log(`⚠️  Some tests failed. Review errors above.`);
    console.log(`\n💡 Consider fixing errors before scaling further.\n`);
  }
}

// Run the test
await runLoadTest();
})().catch(console.error);
