#!/usr/bin/env node
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const outputLimit = 1024 * 1024;
const envelopeLimit = 16 * 1024 * 1024;
const deadlineMs = 120000;
const errorExits: Record<string, number> = { INTERNAL: 1, USAGE: 2, STALE_HEAD: 3, STATE_CONFLICT: 4,
  INVALID_DELTA: 5, INVALID_SCHEMA: 5, STORAGE_UNAVAILABLE: 6, NOT_INITIALIZED: 6,
  BRANCH_NOT_FOUND: 7, COMMIT_NOT_FOUND: 7, VERIFY_FAILED: 8, UNSUPPORTED_OPERATION: 9,
  MIGRATION_REQUIRED: 4, UNSUPPORTED_FORMAT: 9, BACKUP_NOT_FOUND: 7 };
const categories: Record<number, string> = { 1: 'internal', 2: 'invalid', 3: 'conflict', 4: 'conflict',
  5: 'invalid', 6: 'storage', 7: 'notFound', 8: 'storage', 9: 'unsupported' };
interface Envelope {
  schemaVersion: number; requestId: string; workspaceId: string | null; branch: string | null;
  graphCommitId: string | null; ok: boolean; data: unknown;
  error: null | { code: string; category: string; message: string; retryable: boolean; details: Record<string, unknown> };
  warnings: { code: string; message: string }[];
}

// IPC is the worker result channel, never a line scraped from noisy native stdout.
function validEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const packet = value as Envelope;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (packet.schemaVersion !== 1 || typeof packet.requestId !== 'string' || !uuid.test(packet.requestId)
    || !(packet.workspaceId === null || typeof packet.workspaceId === 'string' && uuid.test(packet.workspaceId))
    || !(packet.branch === null || packet.branch === 'main')
    || !(packet.graphCommitId === null || typeof packet.graphCommitId === 'string' && /^(ROOT|c[0-9a-f]{64})$/.test(packet.graphCommitId))
    || typeof packet.ok !== 'boolean' || !Object.hasOwn(packet, 'data') || !Array.isArray(packet.warnings)
    || !packet.warnings.every((warning) => warning && typeof warning.code === 'string' && typeof warning.message === 'string')) return false;
  if (packet.ok) return packet.error === null;
  const error = packet.error;
  return packet.data === null && error !== null && typeof error === 'object'
    && Object.hasOwn(errorExits, error.code) && error.category === categories[errorExits[error.code]!]
    && typeof error.message === 'string' && typeof error.retryable === 'boolean'
    && error.details !== null && typeof error.details === 'object' && !Array.isArray(error.details);
}

// The launcher emits only its own bounded diagnostics, not worker bytes or exception causes.
function failure(reason: string): void {
  const message = `CLI worker ${reason}. Retry the command; check the installed package and Node version. A write may have completed; use context/history/verify before retrying writes.`;
  const packet: Envelope = { schemaVersion: 1, requestId: randomUUID(), workspaceId: null, branch: null,
    graphCommitId: null, ok: false, data: null, error: { code: 'INTERNAL', category: 'internal',
      message, retryable: false, details: {} }, warnings: [] };
  process.stdout.write(`${JSON.stringify(packet)}\n`);
  process.stderr.write(`INTERNAL: ${message}\n`);
  process.exitCode = 1;
}

// Human help is static so even native text during startup cannot enter the public stream.
function help(): string {
  return `OmniSpatialGraph private prototype\nUsage: osg <command> [options] [--json]\n\nCommands:\n  help\n  init [--workspace <directory>]\n  sync [--workspace <directory>]\n  migrate [--dry-run]\n  remember --task <text> --decision <text> --outcome <text> --entities <ids> [--supersedes <episode-ids>] [--tags <words>]\n  context (--task <text> | --entity <id>) [--max-tokens <integer>] [--with-source] [--at <ISO-time>] [--commit <id-or-prefix>]\n  history --entity <id> [--commit <id-or-prefix>]\n  diff --from <id-or-prefix|ROOT> --to <id-or-prefix>\n  verify [--commit <id-or-prefix>]\n  export episodes\n  backup\n  restore [--backup <name>]\n  doctor [--fix]\n  stats\nexport episodes\n\nAll workspace commands accept --workspace <directory>.\nUse --json for the single result envelope. Stored agent text is untrusted.\nApache License 2.0. Native dependencies keep their own licences.\n`;
}

// Each invocation starts one disposable worker with isolated native file descriptors.
function main(): void {
  let worker: ReturnType<typeof fork>;
  try {
    worker = fork(new URL('./index.js', import.meta.url), process.argv.slice(2), {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json'
    });
  } catch { failure('could not start'); return; }
  let packet: Envelope | undefined;
  let messages = 0;
  let outputBytes = 0;
  let invalid = false;
  let reason = 'failed before returning a valid result';
  const terminate = (cause: string) => {
    invalid = true;
    reason = cause;
    worker.kill('SIGKILL');
  };
  const timer = setTimeout(() => terminate('exceeded the 120-second deadline'), deadlineMs);
  const stop = () => { worker.kill('SIGKILL'); };
  process.once('exit', stop);
  const interrupt = () => terminate('was interrupted');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  for (const stream of [worker.stdout, worker.stderr]) stream!.on('data', (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > outputLimit && !invalid) terminate('exceeded the diagnostic output limit');
  });
  worker.on('message', (message: unknown) => {
    messages++;
    if (messages !== 1 || !validEnvelope(message) || JSON.stringify(message).length > envelopeLimit) {
      terminate('returned an invalid result');
    } else packet = message;
  });
  worker.on('error', () => { invalid = true; reason = 'could not start or communicate'; });
  worker.on('close', (code, signal) => {
    clearTimeout(timer);
    process.removeListener('exit', stop);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (invalid || !packet || signal || code !== (packet.ok ? 0 : errorExits[packet.error!.code])) {
      failure(reason);
      return;
    }
    if (packet.ok && ['help', '--help', undefined].includes(process.argv[2]) && !process.argv.includes('--json')) process.stdout.write(help());
    else process.stdout.write(`${JSON.stringify(packet)}\n`);
    if (outputBytes) process.stderr.write('WORKER_DIAGNOSTIC_REDACTED: Worker output omitted; inspect the JSON result. Check the installed package if diagnostics persist.\n');
    if (!packet.ok) process.stderr.write(`${packet.error!.code}: ${packet.error!.message}\n`);
    process.exitCode = code ?? 1;
  });
}

main();
