import { createIsIgnored } from '../../../src/watch/inclusive-node-watch-file-system';

describe('createIsIgnored', () => {
  const gitPath = '/path/to/.git/foo';
  const nodeModulesPath = '/path/to/node_modules/foo/dist/index.js';
  const distModulePath = '/path/to/dist/foo.js';
  const srcModulePath = '/path/to/src/foo.ts';

  it('should handle built-in ignored directories', () => {
    const customPath = '/path/without/git/or/node_modules';
    const isIgnored = createIsIgnored([], []);
    expect(isIgnored(gitPath)).toBe(true);
    expect(isIgnored(customPath)).toBe(false);
    expect(isIgnored('/path/to/.github/foo')).toBe(false);
  });

  it('should allow to passing RegExp to the first argument', () => {
    const isIgnored = createIsIgnored([/[\\/](?:\.git|node_modules)[\\/]/], []);
    expect(isIgnored(gitPath)).toBe(true);
    expect(isIgnored(nodeModulesPath)).toBe(true);
    expect(isIgnored(distModulePath)).toBe(false);
    expect(isIgnored(srcModulePath)).toBe(false);
  });

  it('should allow to passing string path to the first argument', () => {
    const isIgnored = createIsIgnored(['/path/to/.git'], []);
    expect(isIgnored(gitPath)).toBe(true);
    expect(isIgnored(nodeModulesPath)).toBe(false);
    expect(isIgnored(distModulePath)).toBe(false);
    expect(isIgnored(srcModulePath)).toBe(false);
  });

  it('should use a function passed as the first argument', () => {
    const isIgnored = createIsIgnored((path) => path.endsWith('/foo.ts'), []);
    expect(isIgnored(srcModulePath)).toBe(true);
    expect(isIgnored(distModulePath)).toBe(false);
  });

  it('should allow to passing string path to the second argument', () => {
    // exclude: ["dist"] in tsconfig.json
    const isIgnored = createIsIgnored([], ['/path/to/dist']);
    expect(isIgnored(gitPath)).toBe(true);
    expect(isIgnored(nodeModulesPath)).toBe(false);
    expect(isIgnored(distModulePath)).toBe(true);
    expect(isIgnored(srcModulePath)).toBe(false);
  });

  it('should allow to passing glob path to the second argument', () => {
    // exclude: ["dist/**"] in tsconfig.json
    const isIgnored1 = createIsIgnored([], ['/path/to/dist/**']);
    expect(isIgnored1(gitPath)).toBe(true);
    expect(isIgnored1(nodeModulesPath)).toBe(false);
    expect(isIgnored1(distModulePath)).toBe(true);
    expect(isIgnored1(srcModulePath)).toBe(false);

    // exclude: ["**/dist/**"] in tsconfig.json
    const isIgnored2 = createIsIgnored([], ['/path/to/**/dist/**']);
    expect(isIgnored2(gitPath)).toBe(true);
    expect(isIgnored2(nodeModulesPath)).toBe(true);
    expect(isIgnored2(distModulePath)).toBe(true);
    expect(isIgnored2(srcModulePath)).toBe(false);

    // exclude: ["**/dist/*"] in tsconfig.json
    const isIgnored3 = createIsIgnored([], ['/path/to/**/dist/*']);
    expect(isIgnored3(gitPath)).toBe(true);
    expect(isIgnored3(nodeModulesPath)).toBe(true);
    expect(isIgnored3(distModulePath)).toBe(true);
    expect(isIgnored3(srcModulePath)).toBe(false);

    // exclude: ["**/dist"] in tsconfig.json
    const isIgnored4 = createIsIgnored([], ['/path/to/**/dist']);
    expect(isIgnored4(gitPath)).toBe(true);
    expect(isIgnored4(nodeModulesPath)).toBe(true);
    expect(isIgnored4(distModulePath)).toBe(true);
    expect(isIgnored4(srcModulePath)).toBe(false);

    // exclude: ["**/dist/"] in tsconfig.json
    const isIgnored5 = createIsIgnored([], ['/path/to/**/dist/']);
    expect(isIgnored5(gitPath)).toBe(true);
    expect(isIgnored5(nodeModulesPath)).toBe(true);
    expect(isIgnored5(distModulePath)).toBe(true);
    expect(isIgnored5(srcModulePath)).toBe(false);

    // exclude: ["dist/**/*"] in tsconfig.json
    const isIgnored6 = createIsIgnored([], ['/path/to/dist/**/*']);
    expect(isIgnored6(gitPath)).toBe(true);
    expect(isIgnored6(nodeModulesPath)).toBe(false);
    expect(isIgnored6(distModulePath)).toBe(true);
    expect(isIgnored6(srcModulePath)).toBe(false);
  });

  it('should combine multiple ignore patterns', () => {
    const isIgnored = createIsIgnored([/[\\/]node_modules[\\/]/], ['/path/to/dist']);
    expect(isIgnored(gitPath)).toBe(true);
    expect(isIgnored(nodeModulesPath)).toBe(true);
    expect(isIgnored(distModulePath)).toBe(true);
    expect(isIgnored(srcModulePath)).toBe(false);
  });
});
