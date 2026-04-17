import { spawn } from 'node:child_process';
import { cp, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
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
  const clientDist = path.join(root, 'client', 'dist');
  const outputDist = path.join(root, 'dist');

  console.log('[vercel-build] Building client workspace...');
  if (process.platform === 'win32') {
    await run('cmd.exe', ['/d', '/s', '/c', 'npm run build --workspace=client']);
  } else {
    await run('npm', ['run', 'build', '--workspace=client']);
  }

  await access(clientDist, constants.F_OK);

  console.log('[vercel-build] Preparing root dist output...');
  await rm(outputDist, { recursive: true, force: true });
  await cp(clientDist, outputDist, { recursive: true });

  console.log('[vercel-build] Done. Output directory:', outputDist);
}

main().catch((error) => {
  console.error('[vercel-build] Failed:', error);
  process.exit(1);
});
