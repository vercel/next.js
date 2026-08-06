import * as base from '@playwright/test'
import type { NextFixture } from './next-fixture'
import type { NextOptions, NextOptionsConfig } from './next-options'
import type { NextWorkerFixture } from './next-worker-fixture'
import { applyNextWorkerFixture } from './next-worker-fixture'
import { applyNextFixture } from './next-fixture'
import { defaultPlaywrightConfig } from './default-config'

export { defaultPlaywrightConfig }

export * from '@playwright/test'

// Export this second so it overrides the one from `@playwright/test`
export function defineConfig<T extends NextOptionsConfig, W>(
  config: base.PlaywrightTestConfig<T, W>
): base.PlaywrightTestConfig<T, W>
export function defineConfig<T extends NextOptionsConfig = NextOptionsConfig>(
  config: base.PlaywrightTestConfig<T>
): base.PlaywrightTestConfig<T> {
  if (config.webServer !== undefined) {
    // Playwright doesn't merge the `webServer` field as we'd expect, so remove our default if the user specifies one.
    const { webServer, ...partialDefaultPlaywrightConfig } =
      defaultPlaywrightConfig as base.PlaywrightTestConfig<T>
    return base.defineConfig<T>(partialDefaultPlaywrightConfig, config)
  } else {
    return base.defineConfig<T>(
      defaultPlaywrightConfig as base.PlaywrightTestConfig<T>,
      config
    )
  }
}

export type { NextFixture, NextOptions }
export type { FetchHandlerResult } from '../proxy'

export const test = base.test.extend<
  { next: NextFixture; nextOptions: NextOptions },
  { _nextWorker: NextWorkerFixture }
>({
  nextOptions: [{ fetchLoopback: false }, { option: true }],

  _nextWorker: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await applyNextWorkerFixture(use)
    },
    { scope: 'worker', auto: true },
  ],

  next: async ({ nextOptions, _nextWorker, page }, use, testInfo) => {
    await applyNextFixture(use, {
      testInfo,
      nextWorker: _nextWorker,
      page,
      nextOptions,
    })
  },
})

export default test
