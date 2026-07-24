import path from 'node:path';

import { createRpcWorker, RpcExitError } from 'src/rpc';

describe('rpc/rpc-worker', () => {
  it('starts a fresh process for the next request after a worker exits', async () => {
    const worker = createRpcWorker<(action: 'pid' | 'exit') => number>(
      path.resolve(
        process.cwd(),
        'test/unit/rpc/fixtures/restart-worker.cjs',
      ),
      {},
    );

    try {
      const firstPid = await worker('pid');
      await expect(worker('exit')).rejects.toBeInstanceOf(RpcExitError);

      const secondPid = await worker('pid');
      expect(secondPid).not.toBe(firstPid);
      await expect(worker('exit')).rejects.toBeInstanceOf(RpcExitError);
    } finally {
      worker.terminate();
    }
  });
});
