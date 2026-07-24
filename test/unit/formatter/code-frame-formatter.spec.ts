import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

import { createCodeFrameFormatter } from 'src/formatter';
import type { Issue } from 'src/issue';

describe('formatter/code-frame-formatter', () => {
  let fixtureRoot: string;
  let sourceFile: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'ts-checker-codeframe-'));
    const sourceDirectory = path.join(fixtureRoot, 'src');
    sourceFile = path.join(sourceDirectory, 'index.ts');

    mkdirSync(sourceDirectory);
    writeFileSync(
      sourceFile,
      [
        'const foo: number = "1";',
        'const bar = 1;',
        '',
        'function baz() {',
        '  console.log(baz);',
        '}',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it.each([
    [
      {
        severity: 'error',
        code: 'TS2322',
        message: `Type '"1"' is not assignable to type 'number'.`,
        file: 'SOURCE_FILE',
        location: {
          start: {
            line: 1,
            column: 7,
          },
          end: {
            line: 1,
            column: 10,
          },
        },
      },
      [
        `TS2322: Type '"1"' is not assignable to type 'number'.`,
        '  > 1 | const foo: number = "1";',
        '      |       ^^^',
        '    2 | const bar = 1;',
      ].join(os.EOL),
    ],
    [
      {
        severity: 'error',
        code: 'TS2322',
        message: `Type '"1"' is not assignable to type 'number'.`,
        file: 'SOURCE_FILE',
      },
      `TS2322: Type '"1"' is not assignable to type 'number'.`,
    ],
    [
      {
        severity: 'error',
        code: 'TS2322',
        message: `Type '"1"' is not assignable to type 'number'.`,
        file: 'SOURCE_FILE',
        location: {
          start: {
            line: 1,
            column: 7,
          },
        },
      },
      [
        `TS2322: Type '"1"' is not assignable to type 'number'.`,
        '  > 1 | const foo: number = "1";',
        '      |       ^',
        '    2 | const bar = 1;',
      ].join(os.EOL),
    ],
    [
      {
        severity: 'error',
        code: 'TS2322',
        message: `Type '"1"' is not assignable to type 'number'.`,
        file: 'src/not-existing.ts',
        location: {
          start: {
            line: 1,
            column: 7,
          },
          end: {
            line: 1,
            column: 10,
          },
        },
      },
      `TS2322: Type '"1"' is not assignable to type 'number'.`,
    ],
  ])('formats issue message "%p" to "%p"', (...args) => {
    const [issue, expectedFormatted] = args as [Issue, string];
    if (issue.file === 'SOURCE_FILE') {
      issue.file = sourceFile;
    }
    const formatter = createCodeFrameFormatter({
      linesAbove: 1,
      linesBelow: 1,
    });
    const formatted = formatter(issue);

    expect(formatted).toEqual(expectedFormatted);
  });
});
