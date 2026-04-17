import { spawn } from 'node:child_process';

const BASE_URL = process.env.SCHOFY_SMOKE_BASE_URL || 'http://localhost:3334';
const LOGIN_EMAIL = process.env.SCHOFY_SMOKE_EMAIL || 'admin@school.com';
const LOGIN_PASSWORD = process.env.SCHOFY_SMOKE_PASSWORD || 'admin123';
const START_SERVER = process.env.SCHOFY_SMOKE_START_SERVER !== 'false';
const START_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 12_000;

const endpoints = [
  '/api/classes',
  '/api/subjects',
  '/api/attendance',
  '/api/finance/structure',
  '/api/finance/invoices',
  '/api/finance/payments',
  '/api/finance/reports/collection',
  '/api/staff',
  '/api/settings',
  '/api/transport/routes',
  '/api/transport/assignments',
  '/api/announcements',
  '/api/dashboard/stats',
  '/api/sync/changes',
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { response, data, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function canReachHealth() {
  try {
    const { response } = await request('/api/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealthyServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canReachHealth()) return true;
    await delay(750);
  }
  return false;
}

function startServer() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'start', '--workspace=server'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3_000),
  ]);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message, details) {
  console.error(`[FAIL] ${message}`);
  if (details) {
    console.error(details);
  }
}

async function run() {
  let startedServer = null;
  let startedLogs = [];
  let usingExternalServer = false;
  const failures = [];

  try {
    const alreadyHealthy = await canReachHealth();
    if (alreadyHealthy) {
      usingExternalServer = true;
      pass(`Health check at ${BASE_URL}/api/health`);
    } else if (START_SERVER) {
      ({ child: startedServer, logs: startedLogs } = startServer());
      const healthy = await waitForHealthyServer(START_TIMEOUT_MS);
      if (!healthy) {
        failures.push('Server did not become healthy in time.');
      } else {
        pass(`Started local server and reached ${BASE_URL}/api/health`);
      }
    } else {
      failures.push('Server is not running and auto-start is disabled (SCHOFY_SMOKE_START_SERVER=false).');
    }

    if (failures.length > 0) {
      throw new Error('Startup failed');
    }

    const loginBody = JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody,
    });

    if (!login.response.ok || !login.data?.success || !login.data?.data?.token) {
      failures.push(
        `Login failed (${login.response.status}). Check SCHOFY_SMOKE_EMAIL / SCHOFY_SMOKE_PASSWORD.`
      );
      fail('Auth login', login.text);
    } else {
      pass('Auth login');
    }

    const token = login.data?.data?.token;
    if (!token) {
      throw new Error('No token from login');
    }

    const authHeaders = { Authorization: `Bearer ${token}` };

    const me = await request('/api/auth/me', { headers: authHeaders });
    if (!me.response.ok || !me.data?.success) {
      failures.push(`Auth me failed (${me.response.status})`);
      fail('Auth me', me.text);
    } else {
      pass('Auth me');
    }

    for (const endpoint of endpoints) {
      const res = await request(endpoint, { headers: authHeaders });
      if (!res.response.ok) {
        failures.push(`${endpoint} returned ${res.response.status}`);
        fail(`GET ${endpoint}`, res.text);
      } else {
        pass(`GET ${endpoint}`);
      }
    }
  } catch (error) {
    if (failures.length === 0) {
      failures.push(error?.message || String(error));
    }
  } finally {
    if (startedServer) {
      await stopServer(startedServer);
    }
  }

  if (failures.length > 0) {
    console.error('\nSmoke test failed with issues:');
    for (const issue of failures) {
      console.error(`- ${issue}`);
    }
    if (startedLogs.length > 0) {
      console.error('\nServer logs (tail):');
      const tail = startedLogs.join('').split(/\r?\n/).slice(-40).join('\n');
      console.error(tail);
    } else if (usingExternalServer) {
      console.error('\nUsed an already-running server instance.');
    }
    process.exit(1);
  }

  console.log('\nSmoke test passed.');
}

await run();
