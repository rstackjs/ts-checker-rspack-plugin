import type * as rspack from '@rspack/core';

import { getInfrastructureLogger } from '../infrastructure-logger';
import type { Issue } from '../issue';
import { IssueRspackError } from '../issue/issue-rspack-error';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import { getPluginHooks } from '../plugin-hooks';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import { isTypeScriptGoIssue } from '../typescript/type-script-go-runner';

function tapAfterCompileToGetIssues(
  compiler: rspack.Compiler,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const hooks = getPluginHooks(compiler);
  const { debug } = getInfrastructureLogger(compiler);

  compiler.hooks.afterCompile.tapPromise('TsCheckerRspackPlugin', async (compilation) => {
    if (compilation.compiler !== compiler) {
      // run only for the compiler that the plugin was registered for
      return;
    }

    let issues: Issue[] | undefined = [];

    try {
      issues = await state.issuesPromise;
    } catch (error) {
      hooks.error.call(error, compilation);
      return;
    }

    debug('Got issues from getIssuesWorker.', issues?.length);

    if (!issues) {
      // some error has been thrown or it was canceled
      return;
    }

    if (config.typescript.tsgo) {
      const internalIssues = issues.filter(isTypeScriptGoIssue);
      let visibleIssues = issues.filter((issue) => !isTypeScriptGoIssue(issue));

      // filter list of issues by provided issue predicate
      visibleIssues = visibleIssues.filter(config.issue.predicate);

      // modify list of issues in the plugin hooks
      visibleIssues = hooks.issues.call(visibleIssues, compilation);

      issues = internalIssues.concat(visibleIssues);
    } else {
      // filter list of issues by provided issue predicate
      issues = issues.filter(config.issue.predicate);

      // modify list of issues in the plugin hooks
      issues = hooks.issues.call(issues, compilation);
    }

    issues.forEach((issue) => {
      const error = new IssueRspackError(
        config.formatter.format(issue),
        config.formatter.pathType,
        issue,
      );

      if (issue.severity === 'warning') {
        compilation.warnings.push(error);
      } else {
        compilation.errors.push(error);
      }
    });
  });
}

export { tapAfterCompileToGetIssues };
