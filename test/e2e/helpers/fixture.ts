import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
);

export interface TestFixture {
  root: string;
  cleanup(): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  list(relativePath?: string): Promise<string[]>;
  path(relativePath: string): string;
  read(relativePath: string): Promise<string>;
  remove(relativePath: string): Promise<void>;
  replace(
    relativePath: string,
    searchValue: string,
    replaceValue: string,
  ): Promise<void>;
  write(relativePath: string, content: string): Promise<void>;
}

async function listFiles(root: string, relativePath = ''): Promise<string[]> {
  const directory = resolve(root, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryRelativePath = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, entryRelativePath)));
    } else {
      files.push(entryRelativePath);
    }
  }

  return files.sort();
}

export async function createFixture(name: string): Promise<TestFixture> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ts-checker-rspack-e2e-'));
  const copiedRoot = join(temporaryRoot, name);

  await cp(resolve(fixturesDirectory, name), copiedRoot, { recursive: true });
  // File watchers report canonical paths on macOS (`/private/var/...`), so use
  // the same representation for Rspack and TypeScript from the start.
  const root = await realpath(copiedRoot);

  return {
    root,
    path: (relativePath) => resolve(root, relativePath),
    read: (relativePath) => readFile(resolve(root, relativePath), 'utf8'),
    async write(relativePath, content) {
      const destination = resolve(root, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    },
    async replace(relativePath, searchValue, replaceValue) {
      const destination = resolve(root, relativePath);
      const current = await readFile(destination, 'utf8');

      if (!current.includes(searchValue)) {
        throw new Error(
          `Cannot replace missing text in ${relativePath}: ${JSON.stringify(searchValue)}`,
        );
      }

      await writeFile(destination, current.replace(searchValue, replaceValue));
    },
    remove: (relativePath) =>
      rm(resolve(root, relativePath), { force: true, recursive: true }),
    async exists(relativePath) {
      try {
        await access(resolve(root, relativePath));
        return true;
      } catch {
        return false;
      }
    },
    list: (relativePath = '') => listFiles(root, relativePath),
    cleanup: () => rm(temporaryRoot, { force: true, recursive: true }),
  };
}
