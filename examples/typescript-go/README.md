## TypeScript Go configuration example

This example runs `tsgo` through `@typescript/native-preview`.

The plugin starts the tsgo binary as a child process and parses its output to report diagnostics with the normal formatter. If the output cannot be parsed safely, the raw tsgo output is printed instead.

```js
new TsCheckerRspackPlugin({
  typescript: {
    tsgo: true,
  },
});
```

Install dependencies and run:

```bash
pnpm install
pnpm build
```
