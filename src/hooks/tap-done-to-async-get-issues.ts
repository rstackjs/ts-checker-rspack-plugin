import pc from 'picocolors';
import type * as rspack from '@rspack/core';

import { statsFormatter } from '../formatter/stats-formatter';
import { createRspackFormatter } from '../formatter/rspack-formatter';
import { getInfrastructureLogger } from '../infrastructure-logger';
import type { Issue } from '../issue';
import { IssueRspackError } from '../issue/issue-rspack-error';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import { getPluginHooks } from '../plugin-hooks';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import { isPending } from '../utils/async/is-pending';
import { wait } from '../utils/async/wait';
import { isTypeScriptGoIssue } from '../typescript/type-script-go-runner';

function tapDoneToAsyncGetIssues(
  compiler: rspack.Compiler,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const hooks = getPluginHooks(compiler);
  const { debug } = getInfrastructureLogger(compiler);

  compiler.hooks.done.tap('TsCheckerRspackPlugin', async (stats) => {
    if (stats.compilation.compiler !== compiler) {
      // run only for the compiler that the plugin was registered for
      return;
    }

    const issuesPromise = state.issuesPromise;
    let issues: Issue[] | undefined;

    try {
      if (await isPending(issuesPromise)) {
        hooks.waiting.call(stats.compilation);
        config.logger.log(pc.cyan('[type-check] in progress...'));
      } else {
        // wait 10ms to log issues after Rspack stats
        await wait(10);
      }

      issues = await issuesPromise;
    } catch (error) {
      hooks.error.call(error, stats.compilation);
      return;
    }

    if (
      !issues || // some error has been thrown
      state.issuesPromise !== issuesPromise // we have a new request - don't show results for the old one
    ) {
      return;
    }

    debug(`Got ${issues?.length || 0} issues from getIssuesWorker.`);

    if (config.typescript.tsgo) {
      const internalIssues = issues.filter(isTypeScriptGoIssue);
      let visibleIssues = issues.filter((issue) => !isTypeScriptGoIssue(issue));

      // filter list of issues by provided issue predicate
      visibleIssues = visibleIssues.filter(config.issue.predicate);

      // modify list of issues in the plugin hooks
      visibleIssues = hooks.issues.call(visibleIssues, stats.compilation);

      issues = internalIssues.concat(visibleIssues);
    } else {
      // filter list of issues by provided issue predicate
      issues = issues.filter(config.issue.predicate);

      // modify list of issues in the plugin hooks
      issues = hooks.issues.call(issues, stats.compilation);
    }

    const formatter = createRspackFormatter(config.formatter.format, config.formatter.pathType);

    const visibleIssues = config.typescript.tsgo
      ? issues.filter((issue) => !isTypeScriptGoIssue(issue))
      : issues;

    if (visibleIssues.length) {
      // follow Rspack's approach - one process.write to stderr with all errors and warnings
      config.logger.error(visibleIssues.map((issue) => formatter(issue)).join('\n'));
    }

    // print stats of the compilation
    config.logger.log(statsFormatter(issues, stats));

    // report issues to dev-server (overlay), if it's listening
    // skip reporting if there are no issues, to avoid an extra hot reload
    if (visibleIssues.length && state.DevServerDoneTap) {
      visibleIssues.forEach((issue) => {
        const error = new IssueRspackError(
          config.formatter.format(issue),
          config.formatter.pathType,
          issue,
        );

        if (issue.severity === 'warning') {
          stats.compilation.warnings.push(error);
        } else {
          stats.compilation.errors.push(error);
        }
      });

      debug('Sending issues to the dev-server.');
      state.DevServerDoneTap.fn(stats);
    }
  });
}

export { tapDoneToAsyncGetIssues };
