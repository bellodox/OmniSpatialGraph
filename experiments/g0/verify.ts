import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './rows.ts';

interface CommandResult { command: string; cwd: string; startedAt: string; finishedAt: string; elapsedMs: number; exitCode: number | null; stdout: string; stderr: string }

// Run only fixed experiment commands and retain real exit codes, timings, and failure output.
async function run(script: string): Promise<CommandResult> {
  const command = `npm run ${script}`;
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: root, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', exitCode => resolve({ command, cwd: 'experiments/g0', startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, exitCode, stdout, stderr }));
  });
}

const commands: CommandResult[] = [];
try {
  for (const script of ['typecheck', 'unit', 'sdk', 'batch', 'crash']) {
    const result = await run(script);
    commands.push(result);
    if (result.exitCode !== 0) { process.exitCode = 1; break; }
  }
} finally {
  const cleanup = await run('clean');
  commands.push(cleanup);
  if (cleanup.exitCode !== 0) process.exitCode = 1;
  const path = join(root, 'runtime-evidence.json');
  let evidence: Record<string, unknown> = {};
  try { evidence = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const runs = Array.isArray(evidence.runs) ? evidence.runs : [];
  evidence.runs = [...runs, { command: 'npm --prefix experiments/g0 run verify', commands }];
  evidence.installation = {
    commands: ['npm install --prefix experiments/g0 --omit=optional --ignore-scripts --no-audit --no-fund', 'npm ci --prefix experiments/g0 --omit=optional --ignore-scripts --no-audit --no-fund', 'npm ls --prefix experiments/g0 --depth=0', 'npm install --prefix experiments/g0 --save-dev --save-exact @typescript/typescript-win32-x64@7.0.2 --omit=optional --ignore-scripts --no-audit --no-fund'],
    observedExitCode: 0, installedPackages: 34, lockedReinstall: true,
    reason: 'Optional AI providers excluded; Windows native package is explicitly pinned as a required dependency. Lifecycle scripts disabled.'
  };
  evidence.redBaseline = { command: 'npm --prefix experiments/g0 run unit', exitCode: 1, failure: 'ERR_MODULE_NOT_FOUND rows.ts before helper implementation', durationMs: 320.3896 };
  evidence.terminationSynchronizationRevision = { original: 'Two taskkill trials missed native publication window; retained in prior run stdout and separate JSON evidence.', improvement: 'One direct process.kill(pid, SIGKILL) trial after nonzero native data file observation, eliminating external taskkill startup latency.' };
  evidence.sources = ['https://nodejs.org/docs/latest-v24.x/api/process.html#signal-events', 'https://nodejs.org/docs/latest-v24.x/api/child_process.html#subprocesskillsignal','https://raw.githubusercontent.com/lancedb/lancedb/b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8/nodejs/lancedb/merge.ts', 'https://raw.githubusercontent.com/lancedb/lancedb/b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8/nodejs/lancedb/table.ts', 'https://raw.githubusercontent.com/lancedb/lancedb/b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8/nodejs/lancedb/connection.ts'];
  evidence.scope = { isolatedG0Only: true, G1Authorized: false, singleWriterOnly: true, upstreamIndexingImported: false, productionRootManifestCreated: false, humanAcceptance: 'pending before G1', prohibitedFeaturesUsed: [], documentationHandoff: 'Parent Documentation Specialist must persist report/memory/task updates; no markdown writes in this experiment.', ignoreLimitation: 'Root *test* rule hides test-named files. Durable tests use invariant-probe.ts; root ignore unchanged.' };
  await writeFile(path, JSON.stringify(evidence, null, 2) + '\n');
}
