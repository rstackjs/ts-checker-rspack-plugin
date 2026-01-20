import type * as ts from 'typescript';

import { getConfigFilePathFromBuilderProgram, getParsedConfig } from '../config';
import { updateDiagnostics, getDiagnosticsOfProgram } from '../diagnostics';
import { createWatchSolutionBuilderHost } from '../host/watch-solution-builder-host';
import { startTracingIfNeeded, stopTracingIfNeeded } from '../tracing';
import { emitTsBuildInfoIfNeeded } from '../tsbuildinfo';
import { typescript } from '../typescript';
import { config } from '../worker-config';

let solutionBuilderHost:
  | ts.SolutionBuilderWithWatchHost<ts.SemanticDiagnosticsBuilderProgram>
  | undefined;
let solutionBuilder: ts.SolutionBuilder<ts.SemanticDiagnosticsBuilderProgram> | undefined;
let hostDiagnostics: ts.Diagnostic[] = [];

export function useSolutionBuilder() {
  if (!solutionBuilderHost) {
    const parsedConfig = getParsedConfig();

    solutionBuilderHost = createWatchSolutionBuilderHost(
      parsedConfig,
      (
        rootNames,
        compilerOptions,
        host,
        oldProgram,
        configFileParsingDiagnostics,
        projectReferences,
      ) => {
        if (compilerOptions) {
          startTracingIfNeeded(compilerOptions);
        }
        return typescript.createSemanticDiagnosticsBuilderProgram(
          rootNames,
          compilerOptions,
          host,
          oldProgram,
          configFileParsingDiagnostics,
          projectReferences,
        );
      },
      (diagnostic) => {
        // SolutionBuilder can emit graph-level diagnostics while building the project graph
        // (e.g. invalid/cyclic project references) — i.e. before any Program/BuilderProgram exists.
        hostDiagnostics.push(diagnostic);
        updateDiagnostics(config.configFile, hostDiagnostics);
      },
      () => {
        // clean host diagnostics when rebuild start
        hostDiagnostics = [];
      },
      undefined,
      undefined,
      (builderProgram) => {
        const programConfigFile = getConfigFilePathFromBuilderProgram(builderProgram);
        const programDiagnostics = getDiagnosticsOfProgram(builderProgram);

        updateDiagnostics(
          programConfigFile,
          programConfigFile === config.configFile
            ? [...programDiagnostics, ...hostDiagnostics]
            : programDiagnostics,
        );
        emitTsBuildInfoIfNeeded(builderProgram);
        stopTracingIfNeeded(builderProgram);
      },
    );
  }
  if (!solutionBuilder) {
    solutionBuilder = typescript.createSolutionBuilderWithWatch(
      solutionBuilderHost,
      [config.configFile],
      { watch: true },
    );
    solutionBuilder.build();
  }
}

export function invalidateSolutionBuilder(withHost = false) {
  if (withHost) {
    solutionBuilderHost = undefined;
  }
  solutionBuilder = undefined;
  hostDiagnostics = [];
}
