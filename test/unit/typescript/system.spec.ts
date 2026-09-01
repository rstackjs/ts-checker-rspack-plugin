import type { Stats } from 'node:fs';

import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';

const originalWorkerData = process.env.WORKER_DATA;
const fileStats = {
  isFile: () => true,
} as Stats;

async function loadSystem(mode: TypeScriptWorkerConfig['mode']) {
  process.env.WORKER_DATA = JSON.stringify({
    mode,
    typescriptPath: require.resolve('typescript'),
  });
  rs.resetModules();

  const { memFileSystem } = await import('src/typescript/worker/lib/file-system/mem-file-system');
  const { passiveFileSystem } =
    await import('src/typescript/worker/lib/file-system/passive-file-system');
  const { realFileSystem } = await import('src/typescript/worker/lib/file-system/real-file-system');
  const { system } = await import('src/typescript/worker/lib/system');

  return { memFileSystem, passiveFileSystem, realFileSystem, system };
}

describe('typescript system', () => {
  afterEach(() => {
    if (originalWorkerData === undefined) {
      delete process.env.WORKER_DATA;
    } else {
      process.env.WORKER_DATA = originalWorkerData;
    }
    rs.restoreAllMocks();
    rs.resetModules();
  });

  it('reads non-artifact paths directly in readonly mode', async () => {
    const { passiveFileSystem, realFileSystem, system } = await loadSystem('readonly');
    const realReadStats = rs.spyOn(realFileSystem, 'readStats').mockReturnValue(fileStats);
    const passiveReadStats = rs.spyOn(passiveFileSystem, 'readStats');

    expect(system.fileExists('/project/source.ts')).toBe(true);
    expect(realReadStats).toHaveBeenCalledWith('/project/source.ts');
    expect(passiveReadStats).not.toHaveBeenCalled();
  });

  it('keeps using the passive file system in write modes', async () => {
    const { passiveFileSystem, realFileSystem, system } = await loadSystem('write-tsbuildinfo');
    const realReadStats = rs.spyOn(realFileSystem, 'readStats');
    const passiveReadStats = rs.spyOn(passiveFileSystem, 'readStats').mockReturnValue(fileStats);

    expect(system.fileExists('/project/source.ts')).toBe(true);
    expect(passiveReadStats).toHaveBeenCalledWith('/project/source.ts');
    expect(realReadStats).not.toHaveBeenCalled();
  });

  it('restores the passive overlay after readonly mode writes to memory', async () => {
    const { memFileSystem, system } = await loadSystem('readonly');
    const generatedPath = `/virtual/generated-${process.pid}.d.ts`;

    expect(memFileSystem.hasChanges()).toBe(false);
    memFileSystem.writeFile(generatedPath, 'export declare const value: number;\n');

    expect(memFileSystem.hasChanges()).toBe(true);
    expect(system.fileExists(generatedPath)).toBe(true);

    memFileSystem.deleteFile(generatedPath);
  });
});
