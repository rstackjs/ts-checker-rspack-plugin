# End-to-end test architecture

The active end-to-end suite uses Rstest as the runner and tests the plugin
through Rspack's Node API. Playwright is reserved for behavior that only a real
browser can prove, currently the asynchronous Rsbuild error overlay.

## Test design

- `fixtures/` contains immutable source fixtures.
- `helpers/fixture.ts` copies every fixture to a unique, canonical temporary
  directory. Tests never mutate checked-in fixtures or share build output.
- `helpers/rspack.ts` exposes compilation, watch, cleanup, stats, and structured
  plugin-hook recorders. Tests assert issue codes and lifecycle events instead
  of parsing terminal output.
- `with-rspack/` covers compiler and TypeScript integration.
- `with-rsbuild/` covers Rsbuild behavior, including the browser overlay.
- `package-contract.test.ts` packs and installs the publishable artifact in an
  offline temporary consumer before type-checking its public API.

Run the suite with:

```bash
pnpm test:e2e:setup # only required on a fresh checkout
pnpm test:e2e
```

## Legacy coverage mapping

| Legacy area | Current coverage |
| --- | --- |
| Published type definitions | `package-contract.test.ts` |
| TypeScript config reload and overwrite | `with-rspack/config.test.ts` |
| Independent `context`, `configFile`, and `cwd` | `with-rspack/config.test.ts` |
| Custom formatter | `with-rspack/config.test.ts` plus formatter unit tests |
| SolutionBuilder modes and project propagation | `with-rspack/build-and-emit.test.ts`, `with-rspack/watch.test.ts` |
| TypeScript tracing | `with-rspack/tracing.test.ts` |
| Watch add/change/delete/restore | `with-rspack/watch.test.ts` |
| Incremental `package.json` handling | `with-rspack/watch.test.ts` |
| Production output and declaration emission | `with-rspack/build-and-emit.test.ts` |
| `ts-loader` and Babel transpilation | `with-rspack/loader-compat.test.ts` |
| Rspack 1 and the TypeScript 5.0 test baseline | `with-rspack/version-compat.test.ts` |
| Asynchronous dev-server overlay | `with-rsbuild/overlay.test.ts` |
| Worker OOM messaging and restart | deterministic hook and RPC unit tests |

Webpack-only Node API and version permutations were intentionally not carried
forward: the package supports Rspack, while focused smoke tests exercise the
Rspack peer boundary and the TypeScript 5.0 test baseline without reinstalling
obsolete matrices per case.
