# ts-checker-rspack-plugin

Rspack plugin that runs TypeScript type checker on a separate process.

<p>
  <a href="https://npmjs.com/package/ts-checker-rspack-plugin">
   <img src="https://img.shields.io/npm/v/ts-checker-rspack-plugin?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  <a href="https://npmcharts.com/compare/ts-checker-rspack-plugin?minimal=true"><img src="https://img.shields.io/npm/dm/ts-checker-rspack-plugin.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
</p>

## Credits

This plugin is forked from [TypeStrong/fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin), which is created by [Piotr Oleś](https://github.com/piotr-oles). See the original project's [LICENSE](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/blob/main/LICENSE).

Big thanks to `fork-ts-checker-webpack-plugin` creators and contributors for their great work. ❤️

## Features

- Speeds up [TypeScript](https://github.com/Microsoft/TypeScript) type checking (by moving it to a separate process) 🏎
- Supports modern TypeScript features like [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) and [incremental mode](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#faster-subsequent-builds-with-the---incremental-flag) ✨
- Displays nice error messages with the [code frame](https://babeljs.io/docs/en/next/babel-code-frame.html) formatter 🌈

💡 For Rsbuild projects, use [@rsbuild/plugin-type-check](https://github.com/rstackjs/rsbuild-plugin-type-check) to get out-of-the-box experience.

## Installation

This plugin requires **Node.js >=16.0.0+**, **Rspack ^1.0.0**, **TypeScript ^3.8.0**

```sh
# with npm
npm install -D ts-checker-rspack-plugin

# with yarn
yarn add -D ts-checker-rspack-plugin

# with pnpm
pnpm add -D ts-checker-rspack-plugin
```

The minimal Rspack config with [builtin:swc-loader](https://rspack.rs/guide/features/builtin-swc-loader).

```js
// rspack.config.mjs
import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';

export default {
  entry: './src/index.ts',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
          },
        },
      },
    ],
  },
  plugins: [new TsCheckerRspackPlugin()],
};
```

If you are using CommonJS:

```js
// rspack.config.js
const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');

module.exports = {
  plugins: [new TsCheckerRspackPlugin()],
};
```

## Modules resolution

It's very important to be aware that **this plugin uses [TypeScript](https://github.com/Microsoft/TypeScript)'s, not
Rspack's modules resolution**. It means that you have to setup `tsconfig.json` correctly.

> It's because of the performance - with TypeScript's module resolution we don't have to wait for Rspack to compile files.
>
> To debug TypeScript's modules resolution, you can use `tsc --traceResolution` command.

## Options

| Name         | Type                                                             | Default value                             | Description                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `async`      | `boolean`                                                        | `compiler.options.mode === 'development'` | If `true`, reports issues **after** Rspack's compilation is done. Thanks to that it doesn't block the compilation. Used only in the `watch` mode.                                                                                                                                                                 |
| `typescript` | `object`                                                         | `{}`                                      | See [TypeScript options](#typescript-options).                                                                                                                                                                                                                                                                    |
| `issue`      | `object`                                                         | `{}`                                      | See [Issues options](#issues-options).                                                                                                                                                                                                                                                                            |
| `formatter`  | `string` or `object` or `function`                               | `codeframe`                               | Available formatters are `basic`, `codeframe` and a custom `function`. To [configure](https://babeljs.io/docs/en/babel-code-frame#options) `codeframe` formatter, pass: `{ type: 'codeframe', options: { <coderame options> } }`. To use absolute file path, pass: `{ type: 'codeframe', pathType: 'absolute' }`. |
| `logger`     | `{ log: function, error: function }` or `webpack-infrastructure` | `console`                                 | Console-like object to print issues in `async` mode.                                                                                                                                                                                                                                                              |
| `devServer`  | `boolean`                                                        | `true`                                    | If set to `false`, errors will not be reported to Dev Server and displayed in the error overlay.                                                                                                                                                                                                                  |

### TypeScript options

Options for the TypeScript checker (`typescript` option object).

| Name                | Type                                                                           | Default value                                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memoryLimit`       | `number`                                                                       | `8192`                                                                                                         | Memory limit for the checker process in MB. If the process exits with the allocation failed error, try to increase this number.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `configFile`        | `string`                                                                       | `'tsconfig.json'`                                                                                              | Path to the `tsconfig.json` file (path relative to the `compiler.options.context` or absolute path)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `configOverwrite`   | `object`                                                                       | `{ compilerOptions: { skipLibCheck: true, sourceMap: false, inlineSourceMap: false, declarationMap: false } }` | This configuration will overwrite configuration from the `tsconfig.json` file. Supported fields are: `extends`, `compilerOptions`, `include`, `exclude`, `files`, and `references`.                                                                                                                                                                                                                                                                                                                                                                                      |
| `context`           | `string`                                                                       | `dirname(configuration.configFile)`                                                                            | The base path for finding files specified in the `tsconfig.json`. Same as the `context` option from the [ts-loader](https://github.com/TypeStrong/ts-loader#context). Useful if you want to keep your `tsconfig.json` in an external package. Keep in mind that **not** having a `tsconfig.json` in your project root can cause different behaviour between `ts-checker-rspack-plugin` and `tsc`. When using editors like `VS Code` it is advised to add a `tsconfig.json` file to the root of the project and extend the config file referenced in option `configFile`. |
| `build`             | `boolean`                                                                      | `false`                                                                                                        | The equivalent of the `--build` flag for the `tsc` command.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mode`              | `'readonly'` or `'write-dts'` or `'write-tsbuildinfo'` or `'write-references'` | `build === true ? 'write-tsbuildinfo' ? 'readonly'`                                                            | Use `readonly` if you don't want to write anything on the disk, `write-dts` to write only `.d.ts` files, `write-tsbuildinfo` to write only `.tsbuildinfo` files, `write-references` to write both `.js` and `.d.ts` files of project references (last 2 modes requires `build: true`).                                                                                                                                                                                                                                                                                   |
| `diagnosticOptions` | `object`                                                                       | `{ syntactic: false, semantic: true, declaration: false, global: false }`                                      | Settings to select which diagnostics do we want to perform.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `profile`           | `boolean`                                                                      | `false`                                                                                                        | Measures and prints timings related to the TypeScript performance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `typescriptPath`    | `string`                                                                       | `require.resolve('typescript')`                                                                                | If supplied this is a custom path where TypeScript can be found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Issues options

Options for the issues filtering (`issue` option object).

- **Type**:

```typescript
interface IssueOptions {
  include?: IssuePredicateOption;
  exclude?: IssuePredicateOption;
  defaultSeverity?: 'auto' | 'warning' | 'error';
}

interface Issue {
  severity: 'error' | 'warning';
  code: string;
  // file field supports glob matching
  file?: string;
}

type IssueMatch = Partial<Issue>;
type IssuePredicate = (issue: Issue) => boolean;
type IssuePredicateOption = IssuePredicate | IssueMatch | (IssuePredicate | IssueMatch)[];
```

| Name              | Type                             | Default value | Description                                                                                                                                                |
| ----------------- | -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include`         | `IssueFilter`                    | `undefined`   | If `object`, defines issue properties that should be [matched](src/issue/issue-match.ts). If `function`, acts as a predicate where `issue` is an argument. |
| `exclude`         | `IssueFilter`                    | `undefined`   | Same as `include` but issues that match this predicate will be excluded.                                                                                   |
| `defaultSeverity` | `'auto' \| 'warning' \| 'error'` | `'auto'`      | Controls how the plugin assigns the severity of emitted issues.                                                                                            |

`defaultSeverity` behavior:

- `auto`: Uses the default mapping based on the TypeScript diagnostic category (`Error` → `error`, `Warning` → `warning`).
- `warning`: Forces all issues to be emitted as warnings.
- `error`: Forces all issues to be emitted as errors.

- **Example**:

Include issues from the `src` directory, exclude issues from `.spec.ts` files:

```js
new TsCheckerRspackPlugin({
  issue: {
    include: [{ file: '**/src/**/*' }],
    exclude: [{ file: '**/*.spec.ts' }],
  },
});
```

Exclude files under `/node_modules/` using `file:`:

```js
new TsCheckerRspackPlugin({
  issue: {
    exclude: [({ file = '' }) => /[\\/]some-folder[\\/]/.test(file)],
  },
});
```

Force all issues to be emitted as warnings and do not break the build:

```js
new TsCheckerRspackPlugin({
  issue: {
    defaultSeverity: 'warning',
  },
});
```

## Plugin hooks

This plugin provides some custom Rspack hooks:

| Hook key   | Type                       | Params                | Description                                                                                                                                                        |
| ---------- | -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start`    | `AsyncSeriesWaterfallHook` | `change, compilation` | Starts issues checking for a compilation. It's an async waterfall hook, so you can modify the list of changed and removed files or delay the start of the service. |
| `waiting`  | `SyncHook`                 | `compilation`         | Waiting for the issues checking.                                                                                                                                   |
| `canceled` | `SyncHook`                 | `compilation`         | Issues checking for the compilation has been canceled.                                                                                                             |
| `error`    | `SyncHook`                 | `compilation`         | An error occurred during issues checking.                                                                                                                          |
| `issues`   | `SyncWaterfallHook`        | `issues, compilation` | Issues have been received and will be reported. It's a waterfall hook, so you can modify the list of received issues.                                              |

To access plugin hooks and tap into the event, we need to use the `getCompilerHooks` static method.
When we call this method with a [Rspack compiler instance](https://rspack.rs/api/javascript-api/compiler), it returns the object with
[tapable](https://github.com/webpack/tapable) hooks where you can pass in your callbacks.

```js
// ./src/rspack/MyRspackPlugin.js
const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');

class MyRspackPlugin {
  apply(compiler) {
    const hooks = TsCheckerRspackPlugin.getCompilerHooks(compiler);

    // log some message on waiting
    hooks.waiting.tap('MyPlugin', () => {
      console.log('waiting for issues');
    });
    // don't show warnings
    hooks.issues.tap('MyPlugin', (issues) => issues.filter((issue) => issue.severity === 'error'));
  }
}

module.exports = MyRspackPlugin;

// rspack.config.js
const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');
const MyRspackPlugin = require('./src/rspack/MyRspackPlugin');

module.exports = {
  /* ... */
  plugins: [new TsCheckerRspackPlugin(), new MyRspackPlugin()],
};
```

## Profiling types resolution

When using TypeScript 4.3.0 or newer you can profile long type checks by
setting "generateTrace" compiler option. This is an instruction from [microsoft/TypeScript#40063](https://github.com/microsoft/TypeScript/pull/40063):

1. Set "generateTrace": "{folderName}" in your `tsconfig.json` (under `compilerOptions`)
2. Look in the resulting folder. If you used build mode, there will be a `legend.json` telling you what went where.
   Otherwise, there will be `trace.json` file and `types.json` files.
3. Navigate to [edge://tracing](edge://tracing) or [chrome://tracing](chrome://tracing) and load `trace.json`
4. Expand Process 1 with the little triangle in the left sidebar
5. Click on different blocks to see their payloads in the bottom pane
6. Open `types.json` in an editor
7. When you see a type ID in the tracing output, go-to-line {id} to find data about that type

## Enabling incremental mode

TypeScript's "incremental" mode speeds up initial cold-start typechecks keeping an on-disk cache.

It does not speed up subsequent subsequent re-typechecking during the runtime of the dev server.

To enable incremental mode, set `"compilerOptions.incremental": true` in your `tsconfig.json`:

```diff
{
  "compilerOptions": {
+   "incremental": true,
  }
}
```

In the past we also recommended to combine incremental mode with specifying `build: true` in `TsCheckerRspackPlugin` settings to enable TypeScript's ["Build" mode](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript) designed to handle [Project References](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript).

However, "Build" mode causes significant slowdowns for re-typechecks when the dev server is already running, as it switches from TypeScript's in-memory "Watch" mode to "Build" mode. If you need "Build" mode, it can be configured as:

```js
new TsCheckerRspackPlugin({
  typescript: {
    build: true,
  },
});
```

## Vue components

To enable typecheck in `.vue` files, use the custom TypeScript wrapper [`@esctn/vue-tsc-api`](https://www.npmjs.com/package/@esctn/vue-tsc-api). It works on top of [`vue-tsc`](https://www.npmjs.com/package/vue-tsc) — a popular CLI tool for type-checking Vue 3 code.

```bash
npm add @esctn/vue-tsc-api -D
```

```js
new TsCheckerRspackPlugin({
  typescript: {
    typescriptPath: '@esctn/vue-tsc-api',
  },
});
```

## License

MIT License
