import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { cp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root, generated, baseline, record } from './rows.ts';

interface Event { phase: string; epochMs: number; at: string; pid: number; [key: string]: unknown }

// Observe newly written Lance files, not merely serialization or child preparation.
async function dataFiles(path: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const entry of await readdir(path, { recursive: true })) {
    if (entry.endsWith('.lance')) result[entry] = (await stat(join(path, entry))).size;
  }
  return result;
}

// Forcefully target only the dedicated child PID; never use image-name termination.
async function terminate(pid: number): Promise<{ command: string; requestedAt: string; finishedAt: string; exitCode: number | null; output: string }> {
  assert(Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  const requestedAt = new Date().toISOString();
  try {
    const acknowledged = process.kill(pid, 'SIGKILL');
    return { command: `process.kill(${pid}, 'SIGKILL')`, requestedAt, finishedAt: new Date().toISOString(), exitCode: acknowledged ? 0 : 1, output: `Windows unconditional PID termination acknowledged: ${acknowledged}` };
  } catch (error) {
    return { command: `process.kill(${pid}, 'SIGKILL')`, requestedAt, finishedAt: new Date().toISOString(), exitCode: 1, output: String(error) };
  }
}

// A fresh baseline/closed-directory backup isolates every single-writer trial.
async function trial(count: number, kill: boolean): Promise<Record<string, unknown>> {
  const fixture = `crash-${kill ? 'kill' : 'control'}-${count}-${Date.now()}`;
  const commitId = `crash-${fixture}`;
  const path = join(generated, fixture);
  const before = await baseline(path);
  await cp(path, join(generated, `${fixture}-backup`), { recursive: true });
  const baselineFiles = await dataFiles(path);
  const events: Event[] = [];
  const child = fork(join(root, 'crash-writer.ts'), [fixture, String(count), commitId], { cwd: root, silent: true, execArgv: [] });
  assert(child.pid);
  const pid = child.pid;
  let stderr = '';
  child.stderr!.on('data', chunk => { stderr += chunk; });
  child.stdout!.on('data', () => {});
  let exited = false;
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null; at: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => { exited = true; resolve({ code, signal, at: new Date().toISOString() }); });
  });
  let killResult: Awaited<ReturnType<typeof terminate>> | undefined;
  let diskObservation: unknown;
  const deadline = Date.now() + 120000;
  child.on('message', message => {
    const event = message as Event;
    assert.equal(event.pid, pid);
    events.push({ ...event, receivedAt: new Date().toISOString() });
    if (event.phase === 'prepared') child.send('go');
  });
  try {
    while (!exited && Date.now() < deadline) {
      if (kill && events.some(event => event.phase === 'sdk-promise-returned')) {
        const files = await dataFiles(path);
        const newFiles = Object.entries(files).filter(([name, size]) => !(name in baselineFiles) && size > 0);
        if (newFiles.length && !events.some(event => event.phase === 'completed')) {
          diskObservation = { at: new Date().toISOString(), epochMs: Date.now(), newFiles, meaning: 'Nonzero new Lance data files observed after SDK invocation; native storage work has begun.' };
          killResult = await terminate(pid);
          break;
        }
      }
      await delay(5);
    }
    if (!exited && !killResult && Date.now() >= deadline) killResult = await terminate(pid);
    const exit = await exitPromise;
    let writerStillExists = false;
    try { writerStillExists = process.kill(pid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    assert.equal(writerStillExists, false, 'Dedicated writer must no longer exist before recovery');
    const journal = (await readFile(join(generated, `${fixture}-events.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line)) as Event[];
    const recoveryCommand = `node recovery-probe.ts ${fixture} ${count} ${commitId}`;
    const recovery = JSON.parse(execFileSync(process.execPath, [join(root, 'recovery-probe.ts'), fixture, String(count), commitId], { cwd: root, encoding: 'utf8', timeout: 120000 }));
    const completed = journal.some(event => event.phase === 'completed');
    // Missing completion alone is insufficient. Unpublished recovery plus disk writes bounds the kill within native work.
    const midOperationProven = kill && !!diskObservation && killResult?.exitCode === 0 && (exit.code !== 0 || exit.signal === 'SIGKILL') && !completed && recovery.rows === 0 && recovery.markers === 0;
    const outcome = kill ? (midOperationProven ? 'passed' : 'inconclusive') : (exit.code === 0 && completed && recovery.rows === count && recovery.markers === 1 ? 'passed' : 'failed');
    const result = { fixture, count, payloadBytesPerRow: 1024, before, pid, backupCreatedWhileClosed: true, events, journal, diskObservation, killResult, exit, writerStillExists, stderr, recoveryCommand, recovery, outcome, midOperationProven,
      placementLimitations: '5ms polling and OS termination scheduling do not identify the exact native instruction. No native completion hook exists. A passed interrupted trial additionally requires new nonzero storage files and an unpublished recovered batch; fully published trials remain timing-inconclusive.' };
    await writeFile(join(root, `${fixture}-evidence.json`), JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    if (!exited) { await terminate(pid); await exitPromise; }
  }
}

// One successful control and one bounded direct-termination trial after the retained taskkill misses.
await record('crash', async () => {
  assert.equal(process.platform, 'win32');
  const control = await trial(100000, false);
  assert.equal(control.outcome, 'passed');
  const attempts: Record<string, unknown>[] = [];
  for (const count of [200000]) {
    const result = await trial(count, true);
    attempts.push(result);
    if (result.outcome === 'passed') break;
  }
  return { control, attempts, outcome: attempts.some(attempt => attempt.outcome === 'passed') ? 'passed' : 'inconclusive', singleWriter: true, noLiveWriter: true };
});
