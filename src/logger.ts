interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

export type { Logger };
