import { describe, it, expect, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const TEST_PORT = 5088;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

async function waitForServerReady(url: string, timeoutMs: number = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

function startBackendProcess(port: number): ChildProcess {
  const serverDir = path.resolve(__dirname, '../..');
  const proc = spawn(
    'npx',
    ['ts-node', '--transpile-only', 'src/index.ts'],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return proc;
}

async function terminateProcess(proc: ChildProcess): Promise<void> {
  if (proc.killed || proc.exitCode !== null) return;

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, 4000);

    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    proc.kill('SIGTERM');
  });
}

describe('Genuine OS Process Restart Persistence Verification', () => {
  let proc1: ChildProcess | null = null;
  let proc2: ChildProcess | null = null;

  afterAll(async () => {
    if (proc1) await terminateProcess(proc1);
    if (proc2) await terminateProcess(proc2);
  });

  it('persists memories and provenance across distinct operating system process lifecycles', async () => {
    // -------------------------------------------------------------
    // STAGE 1: Start First OS Process
    // -------------------------------------------------------------
    proc1 = startBackendProcess(TEST_PORT);
    await waitForServerReady(BASE_URL);

    // Verify first process responds
    const health1 = (await fetch(`${BASE_URL}/health`).then((r) => r.json())) as any;
    expect(health1.status).toBe('ok');

    // -------------------------------------------------------------
    // STAGE 2: Create Conversation A & Memory in Process 1
    // -------------------------------------------------------------
    const convARes = (await fetch(`${BASE_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Process 1 Architecture Conversation' }),
    }).then((r) => r.json())) as any;

    expect(convARes.data?.id).toBeDefined();
    const convAId = convARes.data.id;

    const originalTimestamp = '2026-11-13T09:15:00.000Z';
    const memoryCreateRes = (await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'System decision: Use Kafka for asynchronous event queues.',
        category: 'project_decision',
        importance: 0.9,
        sourceType: 'user_provided',
        sourceConversationId: convAId,
        originalTimestamp,
      }),
    }).then((r) => r.json())) as any;

    expect(memoryCreateRes.data?.id).toBeDefined();
    const recordedMemoryId = memoryCreateRes.data.id;
    const recordedContent = memoryCreateRes.data.content;
    const recordedTimestamp = memoryCreateRes.data.originalTimestamp;

    // -------------------------------------------------------------
    // STAGE 3: Stop First OS Process (SIGTERM kill)
    // -------------------------------------------------------------
    await terminateProcess(proc1);
    proc1 = null;

    // Verify socket is completely dead
    let isDead = false;
    try {
      await fetch(`${BASE_URL}/health`);
    } catch {
      isDead = true;
    }
    expect(isDead).toBe(true);

    // -------------------------------------------------------------
    // STAGE 4: Start Second Fresh OS Process (Same Port & DB)
    // -------------------------------------------------------------
    proc2 = startBackendProcess(TEST_PORT);
    await waitForServerReady(BASE_URL);

    const health2 = (await fetch(`${BASE_URL}/health`).then((r) => r.json())) as any;
    expect(health2.status).toBe('ok');

    // -------------------------------------------------------------
    // STAGE 5: Open Conversation B in Process 2 & Retrieve Memory
    // -------------------------------------------------------------
    const convBRes = (await fetch(`${BASE_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Process 2 Query Session' }),
    }).then((r) => r.json())) as any;

    expect(convBRes.data?.id).toBeDefined();

    // Query specific memory by ID on the restarted server process
    const memoryFetchRes = (await fetch(`${BASE_URL}/memories/${recordedMemoryId}`).then((r) =>
      r.json(),
    )) as any;

    expect(memoryFetchRes.data?.memoryId).toBe(recordedMemoryId);
    expect(memoryFetchRes.data?.sourceType).toBe('user_provided');
    expect(memoryFetchRes.data?.originalTimestamp).toBe(recordedTimestamp);
    expect(memoryFetchRes.data?.conversationId).toBe(convAId);

    // Search memories via full-text search on restarted process
    const searchRes = (await fetch(`${BASE_URL}/memories/search?q=Kafka event queues`).then((r) =>
      r.json(),
    )) as any;

    expect(Array.isArray(searchRes.data)).toBe(true);
    expect(searchRes.data.length).toBeGreaterThan(0);
    expect(searchRes.data[0].id).toBe(recordedMemoryId);
    expect(searchRes.data[0].content).toBe(recordedContent);

    // -------------------------------------------------------------
    // STAGE 6: Clean Shutdown of Process 2
    // -------------------------------------------------------------
    await terminateProcess(proc2);
    proc2 = null;
  }, 35000);
});
