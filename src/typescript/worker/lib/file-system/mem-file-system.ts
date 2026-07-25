import type { Dirent, Stats } from 'node:fs';
import { dirname } from 'node:path';

import { fs as mem } from 'memfs';

import type { FileSystem } from './file-system';
import { realFileSystem } from './real-file-system';

interface MemFileSystem extends FileSystem {
  /**
   * Whether the in-memory layer may contain changes that should overlay files on disk.
   */
  hasChanges(): boolean;
}

// This flag is intentionally sticky: clearCache() only clears path caches and
// does not remove files from memfs, so disk-only reads are no longer safe after
// the first mutation.
let hasChanges = false;

/**
 * It's an implementation of FileSystem interface which reads and writes to the in-memory file system.
 */
export const memFileSystem: MemFileSystem = {
  ...realFileSystem,
  hasChanges() {
    return hasChanges;
  },
  exists(path: string) {
    return exists(realFileSystem.realPath(path));
  },
  readFile(path: string, encoding?: string) {
    return readFile(realFileSystem.realPath(path), encoding);
  },
  readDir(path: string) {
    return readDir(realFileSystem.realPath(path));
  },
  readStats(path: string) {
    return readStats(realFileSystem.realPath(path));
  },
  writeFile(path: string, data: string) {
    writeFile(realFileSystem.realPath(path), data);
  },
  deleteFile(path: string) {
    deleteFile(realFileSystem.realPath(path));
  },
  createDir(path: string) {
    createDir(realFileSystem.realPath(path));
  },
  updateTimes(path: string, atime: Date, mtime: Date) {
    updateTimes(realFileSystem.realPath(path), atime, mtime);
  },
  clearCache() {
    realFileSystem.clearCache();
  },
};

function exists(path: string): boolean {
  return mem.existsSync(realFileSystem.normalizePath(path));
}

function readStats(path: string): Stats | undefined {
  return exists(path) ? mem.statSync(realFileSystem.normalizePath(path)) : undefined;
}

function readFile(path: string, encoding?: string): string | undefined {
  const stats = readStats(path);

  if (stats && stats.isFile()) {
    return mem
      .readFileSync(realFileSystem.normalizePath(path), { encoding: encoding as BufferEncoding })
      .toString();
  }
}

function readDir(path: string): Dirent[] {
  const stats = readStats(path);

  if (stats && stats.isDirectory()) {
    return mem.readdirSync(realFileSystem.normalizePath(path), {
      withFileTypes: true,
    }) as Dirent[];
  }

  return [];
}

function createDir(path: string) {
  hasChanges = true;
  mem.mkdirSync(realFileSystem.normalizePath(path), { recursive: true });
}

function writeFile(path: string, data: string) {
  hasChanges = true;
  if (!exists(dirname(path))) {
    createDir(dirname(path));
  }

  mem.writeFileSync(realFileSystem.normalizePath(path), data);
}

function deleteFile(path: string) {
  hasChanges = true;
  if (exists(path)) {
    mem.unlinkSync(realFileSystem.normalizePath(path));
  }
}

function updateTimes(path: string, atime: Date, mtime: Date) {
  hasChanges = true;
  if (exists(path)) {
    mem.utimesSync(realFileSystem.normalizePath(path), atime, mtime);
  }
}
