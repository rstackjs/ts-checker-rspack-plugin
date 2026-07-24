import path from 'node:path';

import { createRpcWorker } from 'src/rpc';

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Process ${pid} did not exit.`);
}

describe('rpc/rpc-worker', () => {
  it('starts a fresh process for the next request after a worker exits', async () => {
    const worker = createRpcWorker<() => number>(
      path.resolve(
        process.cwd(),
        'test/unit/rpc/fixtures/restart-worker.cjs',
      ),
      {},
    );

    try {
      const firstPid = await worker();
      await waitForProcessExit(firstPid);

      const secondPid = await worker();
      expect(secondPid).not.toBe(firstPid);
      await waitForProcessExit(secondPid);
    } finally {
      worker.terminate();
    }
  });
});
