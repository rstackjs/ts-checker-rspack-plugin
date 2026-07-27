import type { FilesChange } from '../../files-change';
import type { FilesMatch } from '../../files-match';
import type { Issue, IssueDefaultSeverity } from '../../issue';
import { exposeRpc } from '../../rpc';

import { invalidateArtifacts, registerArtifacts } from './lib/artifacts';
import {
  didConfigFileChanged,
  didDependenciesProbablyChanged,
  didRootFilesChanged,
  getParseConfigIssues,
  invalidateConfig,
} from './lib/config';
import { getDependencies, invalidateDependencies } from './lib/dependencies';
import { getIssues, invalidateDiagnostics } from './lib/diagnostics';
import {
  disablePerformanceIfNeeded,
  enablePerformanceIfNeeded,
  printPerformanceMeasuresIfNeeded,
} from './lib/performance';
import { invalidateProgram, useProgram } from './lib/program/program';
import { invalidateSolutionBuilder, useSolutionBuilder } from './lib/program/solution-builder';
import {
  invalidateWatchProgram,
  invalidateWatchProgramRootFileNames,
  useWatchProgram,
} from './lib/program/watch-program';
import { system } from './lib/system';
import { dumpTracingLegendIfNeeded } from './lib/tracing';
import { invalidateTsBuildInfo } from './lib/tsbuildinfo';
import { config } from './lib/worker-config';

interface GetIssuesWorkerResult {
  issues: Issue[];
  dependencies?: FilesMatch;
}

const getIssuesWorker = async (
  change: FilesChange,
  watching: boolean,
  defaultSeverity: IssueDefaultSeverity,
  withDependencies = false,
): Promise<GetIssuesWorkerResult> => {
  system.invalidateCache();

  if (didConfigFileChanged(change)) {
    invalidateConfig();
    invalidateDependencies();
    invalidateArtifacts();
    invalidateDiagnostics();

    invalidateProgram(true);
    invalidateWatchProgram(true);
    invalidateSolutionBuilder(true);

    invalidateTsBuildInfo();
  } else if (didDependenciesProbablyChanged(getDependencies(), change)) {
    const rootFilesChanged = didRootFilesChanged();

    invalidateConfig();
    invalidateDependencies();
    invalidateArtifacts();

    if (rootFilesChanged) {
      invalidateWatchProgramRootFileNames();
      invalidateSolutionBuilder();
    }
  }

  registerArtifacts();
  enablePerformanceIfNeeded();

  const parseConfigIssues = getParseConfigIssues(defaultSeverity);
  if (parseConfigIssues.length) {
    // report config parse issues and exit
    return {
      issues: parseConfigIssues,
      dependencies: withDependencies ? getDependencies() : undefined,
    };
  }

  // use proper implementation based on the config
  if (config.build) {
    useSolutionBuilder();
  } else if (watching) {
    useWatchProgram();
  } else {
    useProgram();
  }

  // simulate file system events
  change.changedFiles?.forEach((changedFile) => {
    system?.invokeFileChanged(changedFile);
  });
  change.deletedFiles?.forEach((deletedFile) => {
    system?.invokeFileDeleted(deletedFile);
  });

  // wait for all queued events to be processed
  await system.waitForQueued();

  // retrieve all collected diagnostics as normalized issues
  const issues = getIssues(defaultSeverity);

  dumpTracingLegendIfNeeded();
  printPerformanceMeasuresIfNeeded();
  disablePerformanceIfNeeded();

  return {
    issues,
    dependencies: withDependencies ? getDependencies() : undefined,
  };
};

exposeRpc(getIssuesWorker);
export type GetIssuesWorker = typeof getIssuesWorker;
