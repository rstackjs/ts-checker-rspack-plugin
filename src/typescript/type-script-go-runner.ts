import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Issue, IssueDefaultSeverity } from '../issue';
import type { Logger } from '../logger';
import { AbortError } from '../utils/async/abort-error';

import type { TypeScriptWorkerConfig } from './type-script-worker-config';
import {
  TYPESCRIPT_GO_ISSUE_CODE,
  TYPESCRIPT_PACKAGE,
  TYPESCRIPT_PREVIEW_PACKAGE,
  TYPESCRIPT_PREVIEW_PACKAGE_JSON,
} from './type-script-go-constants';

type TypeScriptGoExecutable = {
  command: string;
  args: string[];
};

function resolveTypeScriptGoPackageJsonPath(config: TypeScriptWorkerConfig): string {
  if (
    !path.isAbsolute(config.typescriptPath) ||
    path.basename(config.typescriptPath) !== 'package.json'
  ) {
    throw new Error(
      `The typescriptPath option must be an absolute path to a package.json file when tsgo is enabled.`,
    );
  }

  if (!config.tsgoPackage) {
    throw new Error(
      `The typescriptPath option must point to "${TYPESCRIPT_PREVIEW_PACKAGE_JSON}" or "${TYPESCRIPT_PACKAGE}@>=7".`,
    );
  }

  return config.typescriptPath;
}

async function resolveTypeScriptGoNativeExecutablePath(
  packageJsonPath: string,
  packageName: string,
): Promise<string> {
  const getExePathPath = path.resolve(path.dirname(packageJsonPath), './lib/getExePath.js');
  const getExePathUrl = pathToFileURL(getExePathPath).href;
  const getExePathModule = await import(getExePathUrl);
  const getExePath = getExePathModule.default || getExePathModule.getExePath;

  if (typeof getExePath !== 'function') {
    throw new Error(
      `Cannot resolve the native TypeScript executable from "${packageName}".`,
    );
  }

  const executablePath = getExePath();

  if (typeof executablePath !== 'string' || !fs.existsSync(executablePath)) {
    throw new Error('Executable not found');
  }

  return executablePath;
}

async function resolveTypeScriptGoBinPath(config: TypeScriptWorkerConfig): Promise<string> {
  const packageJsonPath = resolveTypeScriptGoPackageJsonPath(config);

  if (config.tsgoPackage === 'typescript') {
    return resolveTypeScriptGoNativeExecutablePath(packageJsonPath, TYPESCRIPT_PACKAGE);
  }

  return resolveTypeScriptGoNativeExecutablePath(packageJsonPath, TYPESCRIPT_PREVIEW_PACKAGE);
}

async function resolveTypeScriptGoExecutable(
  config: TypeScriptWorkerConfig,
): Promise<TypeScriptGoExecutable> {
  const binPath = await resolveTypeScriptGoBinPath(config);

  return {
    command: binPath,
    args: [],
  };
}

function createTypeScriptGoArgs(config: TypeScriptWorkerConfig) {
  const args = config.build ? ['--build', config.configFile] : ['--project', config.configFile];

  // Keep tsgo as a checker in this plugin. Incremental .tsbuildinfo is still controlled
  // by tsconfig's `incremental` / `composite` options, matching the compiler CLI.
  args.push('--noEmit', '--pretty');

  return args;
}

function logOutput(logger: Pick<Logger, 'error'>, output: string) {
  if (!output.trim()) {
    return;
  }

  logger.error(output.trimEnd());
}

function stripAnsi(output: string) {
  // rslint-disable-next-line no-control-regex
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function getTypeScriptGoErrorCount(output: string): number | undefined {
  const plainOutput = stripAnsi(output);
  const matches = Array.from(plainOutput.matchAll(/\bFound\s+(\d+)\s+errors?\b/g));
  const lastMatch = matches[matches.length - 1];

  if (!lastMatch) {
    return undefined;
  }

  return Number(lastMatch[1]);
}

function getTypeScriptGoIssueSeverity(
  severity: Issue['severity'],
  defaultSeverity: IssueDefaultSeverity,
) {
  return defaultSeverity === 'auto' ? severity : defaultSeverity;
}

function createTypeScriptGoIssue(message: string): Issue {
  return {
    severity: 'error',
    code: TYPESCRIPT_GO_ISSUE_CODE,
    message,
  };
}

const diagnosticPattern = /^(.*?):(\d+):(\d+)\s+-\s+(error|warning)\s+TS(\d+):\s+(.+)$/;
const globalDiagnosticPattern = /^(error|warning)\s+TS(\d+):\s+(.+)$/;

function getTypeScriptGoMarkerLength(output: string, startIndex: number): number | undefined {
  const lines = output.slice(startIndex).split(/\r?\n/);

  for (const line of lines) {
    if (
      diagnosticPattern.test(line) ||
      globalDiagnosticPattern.test(line) ||
      /^Found\s+\d+\s+errors?\b/.test(line)
    ) {
      return undefined;
    }

    const marker = line.match(/^\s*([~^]+)\s*$/);
    if (marker) {
      return marker[1].length;
    }
  }

  return undefined;
}

function parseTypeScriptGoIssues(
  output: string,
  config: TypeScriptWorkerConfig,
  defaultSeverity: IssueDefaultSeverity = 'auto',
): Issue[] {
  const issues: Issue[] = [];
  const plainOutput = stripAnsi(output);
  const diagnosticPatternWithGlobal = new RegExp(diagnosticPattern, 'gm');
  const globalDiagnosticPatternWithGlobal = new RegExp(globalDiagnosticPattern, 'gm');

  for (const match of plainOutput.matchAll(diagnosticPatternWithGlobal)) {
    const [, file, line, column, severity, code, message] = match;
    const startColumn = Number(column);
    const markerLength = getTypeScriptGoMarkerLength(
      plainOutput,
      (match.index || 0) + match[0].length,
    );
    const position = {
      line: Number(line),
      column: startColumn,
    };

    issues.push({
      severity: getTypeScriptGoIssueSeverity(severity as Issue['severity'], defaultSeverity),
      code: `TS${code}`,
      message,
      file: path.isAbsolute(file) ? file : path.resolve(config.context, file),
      location: {
        start: position,
        end: {
          line: position.line,
          column: markerLength ? startColumn + markerLength : startColumn,
        },
      },
    });
  }

  for (const match of plainOutput.matchAll(globalDiagnosticPatternWithGlobal)) {
    const [, severity, code, message] = match;

    issues.push({
      severity: getTypeScriptGoIssueSeverity(severity as Issue['severity'], defaultSeverity),
      code: `TS${code}`,
      message,
    });
  }

  return issues;
}

function createTypeScriptGoExitIssues(
  output: string,
  signal: NodeJS.Signals | null,
  config: TypeScriptWorkerConfig,
  defaultSeverity: IssueDefaultSeverity = 'auto',
): Issue[] {
  const parsedIssues = parseTypeScriptGoIssues(output, config, defaultSeverity);
  const errorCount = getTypeScriptGoErrorCount(output);

  if (parsedIssues.length && (errorCount === undefined || parsedIssues.length >= errorCount)) {
    return parsedIssues;
  }

  if (errorCount !== undefined) {
    return Array.from({ length: Math.max(errorCount, 1) }, () =>
      createTypeScriptGoIssue('tsgo check failed. See the output above for diagnostics.'),
    );
  }

  if (signal !== null) {
    return [
      createTypeScriptGoIssue(
        `tsgo check interrupted by ${signal}. See the output above for diagnostics.`,
      ),
    ];
  }

  return [createTypeScriptGoIssue('tsgo check failed. See the output above for diagnostics.')];
}

function isTypeScriptGoIssue(issue: Issue): boolean {
  return issue.code === TYPESCRIPT_GO_ISSUE_CODE;
}

function isTypeScriptGoStatsError(error: unknown): boolean {
  const issue = (error as { issue?: Issue })?.issue;

  if (issue && isTypeScriptGoIssue(issue)) {
    return true;
  }

  const message = (error as { message?: unknown })?.message;

  return typeof message === 'string' && message.includes(`${TYPESCRIPT_GO_ISSUE_CODE}:`);
}

async function runTypeScriptGo(
  config: TypeScriptWorkerConfig,
  logger: Pick<Logger, 'error'>,
  defaultSeverity: IssueDefaultSeverity = 'auto',
  signal?: AbortSignal,
): Promise<Issue[]> {
  AbortError.throwIfAborted(signal);

  const executable = await resolveTypeScriptGoExecutable(config);
  const args = createTypeScriptGoArgs(config);

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';
    const childProcess = spawn(executable.command, [...executable.args, ...args], {
      cwd: config.context,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      childProcess.stdout?.removeAllListeners();
      childProcess.stderr?.removeAllListeners();
      childProcess.removeAllListeners();
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const abort = () => {
      childProcess.kill('SIGTERM');
      finish(() => reject(new AbortError()));
    };

    signal?.addEventListener('abort', abort, { once: true });

    childProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    childProcess.on('error', (error) => {
      finish(() => reject(error));
    });

    childProcess.on('close', (exitCode, exitSignal) => {
      finish(() => {
        if (exitCode === 0 && exitSignal === null) {
          logOutput(logger, output);
          resolve([]);
          return;
        }

        const issues = createTypeScriptGoExitIssues(
          output,
          exitSignal,
          config,
          defaultSeverity,
        );

        if (issues.some(isTypeScriptGoIssue)) {
          logOutput(logger, output);
        }

        resolve(issues);
      });
    });
  });
}

function getTypeScriptGoDependencies(config: TypeScriptWorkerConfig): {
  files: string[];
  dirs: string[];
  excluded: string[];
  extensions: string[];
} {
  return {
    files: [config.configFile],
    dirs: [config.context],
    excluded: [path.join(config.context, 'node_modules')],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
  };
}

export {
  createTypeScriptGoArgs,
  createTypeScriptGoExitIssues,
  getTypeScriptGoDependencies,
  getTypeScriptGoErrorCount,
  isTypeScriptGoIssue,
  isTypeScriptGoStatsError,
  parseTypeScriptGoIssues,
  resolveTypeScriptGoExecutable,
  resolveTypeScriptGoBinPath,
  resolveTypeScriptGoPackageJsonPath,
  runTypeScriptGo,
};
