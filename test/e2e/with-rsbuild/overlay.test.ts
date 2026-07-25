import { createRsbuild } from '@rsbuild/core';
import { getRandomPort } from '@rstackjs/test-utils';
import { expect, test } from '@rstest/playwright';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';

test('shows and clears asynchronous type errors in the browser overlay', async ({
  page,
}) => {
  const fixture = await createFixture('basic');
  const rsbuild = await createRsbuild({
    cwd: fixture.root,
    rsbuildConfig: {
      server: {
        port: await getRandomPort(),
      },
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              async: true,
              typescript: { tsgo: false },
            }),
          ],
        },
      },
    },
  });
  const { server, urls } = await rsbuild.startDevServer();

  try {
    await page.goto(urls[0]);
    await expect(page.locator('main')).toHaveText('3');

    await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");

    const overlay = page.locator('rsbuild-error-overlay');
    const overlayContent = overlay.locator('.content');
    await expect(overlayContent).toContainText('TS2345', {
      timeout: 20_000,
    });
    await expect(overlayContent).toContainText(
      "Argument of type 'string' is not assignable to parameter of type 'number'.",
    );

    await fixture.replace('src/index.ts', "add(1, '2')", 'add(1, 2)');

    await expect(overlay).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('main')).toHaveText('3');
  } finally {
    await server.close();
    await fixture.cleanup();
  }
}, 30_000);
