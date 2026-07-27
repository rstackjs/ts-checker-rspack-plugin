import type { Dirent, Stats } from 'node:fs';
import { dirname, basename, join, normalize } from 'node:path';

import fs from 'node:fs';

import type { FileSystem } from './file-system';

const existsCache = new Map<string, boolean>();
const normalizedPathCache = new Map<string, string>();
const readStatsCache = new Map<string, Stats>();
const readFileCache = new Map<string, string | undefined>();
const readDirCache = new Map<string, Dirent[]>();
const realPathCache = new Map<string, string>();

/**
 * It's an implementation of the FileSystem interface which reads and writes directly to the real file system.
 */
export const realFileSystem: FileSystem = {
  exists(path: string) {
    return exists(path);
  },
  readFile(path: string, encoding?: string) {
    return readFile(path, encoding);
  },
  readDir(path: string) {
    return readDir(path);
  },
  readStats(path: string) {
    return readStats(path);
  },
  realPath(path: string) {
    return getRealPath(path);
  },
  normalizePath(path: string) {
    return normalizePath(path);
  },
  writeFile(path: string, data: string) {
    writeFile(getRealPath(path), data);
  },
  deleteFile(path: string) {
    deleteFile(getRealPath(path));
  },
  createDir(path: string) {
    createDir(getRealPath(path));
  },
  updateTimes(path: string, atime: Date, mtime: Date) {
    updateTimes(getRealPath(path), atime, mtime);
  },
  clearCache() {
    existsCache.clear();
    normalizedPathCache.clear();
    readStatsCache.clear();
    readFileCache.clear();
    readDirCache.clear();
    realPathCache.clear();
  },
};

// read methods
function exists(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return existsNormalized(normalizedPath);
}

function existsNormalized(normalizedPath: string): boolean {
  const cached = existsCache.get(normalizedPath);

  if (cached !== undefined) {
    return cached;
  }

  const result = fs.existsSync(normalizedPath);
  existsCache.set(normalizedPath, result);

  return result;
}

function readStats(path: string): Stats | undefined {
  const normalizedPath = normalizePath(path);

  if (!readStatsCache.has(normalizedPath)) {
    if (existsNormalized(normalizedPath)) {
      readStatsCache.set(normalizedPath, fs.statSync(normalizedPath));
    }
  }

  return readStatsCache.get(normalizedPath);
}

function readFile(path: string, encoding?: string): string | undefined {
  const normalizedPath = normalizePath(path);

  if (!readFileCache.has(normalizedPath)) {
    const stats = readStats(normalizedPath);

    if (stats && stats.isFile()) {
      readFileCache.set(
        normalizedPath,
        fs.readFileSync(normalizedPath, { encoding: encoding as BufferEncoding }).toString(),
      );
    } else {
      readFileCache.set(normalizedPath, undefined);
    }
  }

  return readFileCache.get(normalizedPath);
}

function readDir(path: string): Dirent[] {
  const normalizedPath = normalizePath(path);

  if (!readDirCache.has(normalizedPath)) {
    const stats = readStats(normalizedPath);

    if (stats && stats.isDirectory()) {
      readDirCache.set(normalizedPath, fs.readdirSync(normalizedPath, { withFileTypes: true }));
    } else {
      readDirCache.set(normalizedPath, []);
    }
  }

  return readDirCache.get(normalizedPath) || [];
}

function getRealPath(path: string) {
  const normalizedPath = normalizePath(path);

  if (!realPathCache.has(normalizedPath)) {
    let base = normalizedPath;
    let nested = '';

    while (base !== dirname(base)) {
      const cachedBase = realPathCache.get(base);
      if (cachedBase) {
        realPathCache.set(normalizedPath, join(cachedBase, nested));
        break;
      }

      if (existsNormalized(base)) {
        const realBase = normalizePath(realpath(base));

        // Cache the existing ancestor as well as the requested path. TypeScript
        // probes many non-existent extensions below the same directory during
        // module resolution, so resolving that directory repeatedly is costly.
        realPathCache.set(base, realBase);
        realPathCache.set(normalizedPath, join(realBase, nested));
        break;
      }

      nested = join(basename(base), nested);
      base = dirname(base);
    }
  }

  return realPathCache.get(normalizedPath) || normalizedPath;
}

function normalizePath(path: string): string {
  const cached = normalizedPathCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const normalizedPath = normalize(path);
  normalizedPathCache.set(path, normalizedPath);
  return normalizedPath;
}

function fsRealPathHandlingLongPath(path: string): string {
  return path.length < 260 ? fs.realpathSync.native(path) : fs.realpathSync(path);
}

// Keep this aligned with TypeScript's Node system implementation:
// https://github.com/microsoft/TypeScript/pull/50306
const fsRealpath = fs.realpathSync.native
  ? process.platform === 'win32'
    ? fsRealPathHandlingLongPath
    : fs.realpathSync.native
  : fs.realpathSync;

function realpath(path: string): string {
  try {
    return fsRealpath(path);
  } catch {
    return path;
  }
}

function createDir(path: string) {
  const normalizedPath = normalizePath(path);

  fs.mkdirSync(normalizedPath, { recursive: true });

  // update cache
  existsCache.set(normalizedPath, true);
  if (readDirCache.has(dirname(normalizedPath))) {
    readDirCache.delete(dirname(normalizedPath));
  }
  if (readStatsCache.has(normalizedPath)) {
    readStatsCache.delete(normalizedPath);
  }
}

function writeFile(path: string, data: string) {
  const normalizedPath = normalizePath(path);

  if (!exists(dirname(normalizedPath))) {
    createDir(dirname(normalizedPath));
  }

  fs.writeFileSync(normalizedPath, data);

  // update cache
  existsCache.set(normalizedPath, true);
  if (readDirCache.has(dirname(normalizedPath))) {
    readDirCache.delete(dirname(normalizedPath));
  }
  if (readStatsCache.has(normalizedPath)) {
    readStatsCache.delete(normalizedPath);
  }
  if (readFileCache.has(normalizedPath)) {
    readFileCache.delete(normalizedPath);
  }
}

function deleteFile(path: string) {
  if (exists(path)) {
    const normalizedPath = normalizePath(path);

    fs.unlinkSync(normalizedPath);

    // update cache
    existsCache.set(normalizedPath, false);
    if (readDirCache.has(dirname(normalizedPath))) {
      readDirCache.delete(dirname(normalizedPath));
    }
    if (readStatsCache.has(normalizedPath)) {
      readStatsCache.delete(normalizedPath);
    }
    if (readFileCache.has(normalizedPath)) {
      readFileCache.delete(normalizedPath);
    }
  }
}

function updateTimes(path: string, atime: Date, mtime: Date) {
  if (exists(path)) {
    const normalizedPath = normalizePath(path);

    fs.utimesSync(normalizedPath, atime, mtime);

    // update cache
    if (readStatsCache.has(normalizedPath)) {
      readStatsCache.delete(normalizedPath);
    }
  }
}
