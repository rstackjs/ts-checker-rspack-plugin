import { createRequire } from 'node:module';

import { createFixture } from './fixture';

const require = createRequire(import.meta.url);

export const contentMapperTypeScriptPath = require.resolve('typescript-7-1/package.json');

export async function createContentMapperFixture() {
  const fixture = await createFixture('basic');
  await fixture.write('src/index.ts', 'export const value = 1;\n');
  await fixture.write(
    'src/check.ts',
    'import value from "./value.module.css";\nexport const checked: number = value;\n',
  );
  await fixture.write('src/value.module.css', 'export default 42;\n');
  await fixture.write(
    'tsconfig.base.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'Node16',
        allowArbitraryExtensions: true,
        skipLibCheck: true,
      },
      contentMappers: [{ package: 'test-content-mapper', extensions: ['.module.css'] }],
      include: ['src'],
    }),
  );
  await fixture.write(
    'tsconfig.json',
    '{ // inherited mapper\n "extends": "./tsconfig.base.json",\n }',
  );
  await fixture.write(
    'node_modules/test-content-mapper/package.json',
    JSON.stringify({
      name: 'test-content-mapper',
      version: '1.0.0',
      typescript: {
        contentMapper: { exec: [process.execPath, 'mapper.cjs'], compilerOptions: [] },
      },
    }),
  );
  // A minimal JSON-RPC mapper that treats the input as TypeScript source.
  await fixture.write(
    'node_modules/test-content-mapper/mapper.cjs',
    `
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.includes('\\r\\n\\r\\n')) {
    const start = buffer.indexOf('\\r\\n\\r\\n') + 4;
    const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, start).toString())[1]);
    if (buffer.length < start + length) break;
    const { id, method, params } = JSON.parse(buffer.subarray(start, start + length).toString());
    buffer = buffer.subarray(start + length);
    const result = method === 'initialize'
      ? { positionEncoding: 'utf-8', diagnosticSource: 'test-mapper' }
      : method === 'transform' ? { text: params.content, extension: '.ts' } : {};
    const body = JSON.stringify({ jsonrpc: '2.0', id, result });
    process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body);
  }
});
`,
  );
  return fixture;
}
