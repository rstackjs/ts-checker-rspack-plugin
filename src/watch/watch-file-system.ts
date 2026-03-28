import type { EventEmitter } from 'node:events';

import type * as rspack from '@rspack/core';

// watchpack v1 and v2 internal interface
interface Watchpack extends EventEmitter {
  _onChange(item: string, mtime: number, file: string, type?: string): void;
  _onRemove(item: string, file: string, type?: string): void;
}

type Watch = NonNullable<rspack.Compiler['watchFileSystem']>['watch'];

interface WatchFileSystem {
  watcher?: Watchpack;
  wfs?: {
    watcher: Watchpack;
  };
  watch: Watch;
}

export type { WatchFileSystem, Watchpack };
