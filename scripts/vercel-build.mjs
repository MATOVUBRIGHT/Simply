import { spawn } from 'node:child_process';
import { cp, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

function run(command, args, cwd) {
  console.log(`[vercel-build] Running: ${command} ${args.join(' ')} (in ${cwd})`);
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const child = spawn(command, args, { 
      stdio: 'inherit', 
      shell: isWin,
      cwd,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const root = process.cwd();
  console.log('[vercel-build] Root directory:', root);
  console.log('[vercel-build] Node version:', process.version);
  
  const clientDir = path.join(root, 'client');
  const clientDist = path.join(clientDir, 'dist');
  const outputDist = path.join(root, 'public');

  console.log('[vercel-build] Building client workspace...');
  // Build shared package first so @schofy/shared types are available
  const sharedDir = path.join(root, 'shared');
  process.chdir(sharedDir);
  console.log('[vercel-build] Building shared package...');
  await run('npx', ['tsc', '-b']);
  
  process.chdir(clientDir);
  console.log('[vercel-build] Changed directory to:', process.cwd());
  
  await run('npm', ['install']);
  await run('npm', ['run', 'build']);
  
  process.chdir(root);
  console.log('[vercel-build] Returned to root directory:', process.cwd());

  try {
    await access(clientDist, constants.F_OK);
    console.log('[vercel-build] Found client/dist');
  } catch (e) {
    console.error(`[vercel-build] Error: ${clientDist} does not exist after build!`);
    // List files to help debugging
    try {
      if (process.platform === 'win32') {
        await run('cmd.exe', ['/d', '/s', '/c', 'dir /s /b'], root);
      } else {
        await run('ls', ['-R'], root);
      }
    } catch (lsError) {
      console.error('[vercel-build] Failed to list files:', lsError.message);
    }
    throw e;
  }

  console.log('[vercel-build] Preparing root public output...');
  await rm(outputDist, { recursive: true, force: true });
  await cp(clientDist, outputDist, { recursive: true });

  // Verify index.html exists
  try {
    await access(path.join(outputDist, 'index.html'), constants.F_OK);
    console.log('[vercel-build] ✓ index.html found in output directory');
  } catch {
    throw new Error('index.html missing from output directory!');
  }

  console.log('[vercel-build] Done. Output directory:', outputDist);
}

main().catch((error) => {
  console.error('[vercel-build] Failed:', error);
  process.exit(1);
});
