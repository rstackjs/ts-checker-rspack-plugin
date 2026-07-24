import type { FilesChange } from '../../files-change';
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
  useWatchProgram,
} from './lib/program/watch-program';
import { system } from './lib/system';
import { dumpTracingLegendIfNeeded } from './lib/tracing';
import { invalidateTsBuildInfo } from './lib/tsbuildinfo';
import { config } from './lib/worker-config';

const getIssuesWorker = async (
  change: FilesChange,
  watching: boolean,
  defaultSeverity: IssueDefaultSeverity,
): Promise<Issue[]> => {
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
    // Compare against the currently parsed config before invalidating it.
    // Otherwise parseNextConfig() has no previous root-file list to compare
    // and newly created or restored files are never added to watch programs.
    const rootFilesChanged = didRootFilesChanged();

    invalidateConfig();
    invalidateDependencies();
    invalidateArtifacts();

    if (rootFilesChanged) {
      // Recreate the host as well as the watch program so its root-file list
      // and module-resolution cache both reflect added, deleted, or restored
      // files.
      invalidateWatchProgram(true);
      invalidateSolutionBuilder();
    }
  }

  registerArtifacts();
  enablePerformanceIfNeeded();

  const parseConfigIssues = getParseConfigIssues(defaultSeverity);
  if (parseConfigIssues.length) {
    // report config parse issues and exit
    return parseConfigIssues;
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

  return issues;
};

exposeRpc(getIssuesWorker);
export type GetIssuesWorker = typeof getIssuesWorker;
