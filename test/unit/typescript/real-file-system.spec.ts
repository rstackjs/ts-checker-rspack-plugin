import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { realFileSystem } from 'src/typescript/worker/lib/file-system/real-file-system';

describe('realFileSystem', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-real-fs-'));
    realFileSystem.clearCache();
  });

  afterEach(() => {
    realFileSystem.clearCache();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    rs.restoreAllMocks();
  });

  it('reuses a cached real path for non-existent siblings', () => {
    const parentDirectory = path.join(temporaryDirectory, 'parent');
    fs.mkdirSync(parentDirectory);
    const realParentDirectory = fs.realpathSync(parentDirectory);
    const realpathSpy = rs.spyOn(fs, 'realpathSync');

    expect(realFileSystem.realPath(path.join(parentDirectory, 'first.ts'))).toBe(
      path.join(realParentDirectory, 'first.ts'),
    );
    expect(realFileSystem.realPath(path.join(parentDirectory, 'second.ts'))).toBe(
      path.join(realParentDirectory, 'second.ts'),
    );

    expect(realpathSpy).toHaveBeenCalledTimes(1);
    expect(realpathSpy).toHaveBeenCalledWith(parentDirectory);
  });

  it('still resolves an existing symlink below a cached parent path', () => {
    const parentDirectory = path.join(temporaryDirectory, 'parent');
    const targetDirectory = path.join(temporaryDirectory, 'target');
    const linkedDirectory = path.join(parentDirectory, 'linked');
    fs.mkdirSync(parentDirectory);
    fs.mkdirSync(targetDirectory);
    fs.symlinkSync(
      targetDirectory,
      linkedDirectory,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    realFileSystem.realPath(path.join(parentDirectory, 'missing.ts'));

    expect(realFileSystem.realPath(linkedDirectory)).toBe(fs.realpathSync(targetDirectory));
  });
});
