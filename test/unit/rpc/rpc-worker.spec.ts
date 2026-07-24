import { once } from 'node:events';
import path from 'node:path';

import { createRpcWorker } from 'src/rpc';

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
      const firstProcess = worker.process;

      expect(firstProcess?.pid).toBe(firstPid);
      expect(worker.connected).toBe(true);

      const firstClose = once(firstProcess!, 'close');
      firstProcess!.kill('SIGTERM');
      await firstClose;

      expect(worker.connected).toBe(false);

      const secondPid = await worker();
      expect(secondPid).not.toBe(firstPid);
      expect(worker.process?.pid).toBe(secondPid);
      expect(worker.connected).toBe(true);
    } finally {
      const activeProcess = worker.process;
      const close = activeProcess ? once(activeProcess, 'close') : undefined;
      worker.terminate();
      await close;
    }
  });
});
