import os from 'node:os';
import path from 'node:path';

import pc from 'picocolors';

import { formatIssueLocation } from '../issue';
import { forwardSlash } from '../utils/path/forward-slash';
import { relativeToContext } from '../utils/path/relative-to-context';

import type { Formatter, FormatterPathType } from './formatter';

function createRspackFormatter(formatter: Formatter, pathType: FormatterPathType): Formatter {
  // mimics Rspack error formatter
  return function rspackFormatter(issue) {
    const color = issue.severity === 'warning' ? pc.yellow : pc.red;

    const severity = issue.severity.toUpperCase();

    if (issue.file) {
      let location = pc.bold(
        pathType === 'absolute'
          ? forwardSlash(path.resolve(issue.file))
          : relativeToContext(issue.file, process.cwd()),
      );
      if (issue.location) {
        location += `:${pc.bold(pc.green(formatIssueLocation(issue.location)))}`;
      }

      return [`${pc.bold(color(severity))} in ${location}`, formatter(issue), ''].join(os.EOL);
    } else {
      return [`${pc.bold(color(severity))} in ` + formatter(issue), ''].join(os.EOL);
    }
  };
}

export { createRspackFormatter };
