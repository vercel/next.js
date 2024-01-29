// eslint-disable-next-line import/no-extraneous-dependencies
import * as base from '@playwright/test'
import type { NextFixture } from './next-fixture'
import type { NextOptions } from './next-options'
import type { NextWorkerFixture } from './next-worker-fixture'
import { applyNextWorkerFixture } from './next-worker-fixture'
import { applyNextFixture } from './next-fixture'

// eslint-disable-next-line import/no-extraneous-dependencies
export * from '@playwright/test'

export type { NextFixture, NextOptions }
export type { FetchHandlerResult } from '../proxy'

export interface NextOptionsConfig {
  nextOptions?: NextOptions
}

export function defineConfig<T extends NextOptionsConfig, W>(
  config: base.PlaywrightTestConfig<T, W>
): base.PlaywrightTestConfig<T, W>
export function defineConfig<T extends NextOptionsConfig = NextOptionsConfig>(
  config: base.PlaywrightTestConfig<T>
): base.PlaywrightTestConfig<T> {
  return base.defineConfig<T>(config)
}

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

  next: [
    async ({ nextOptions, _nextWorker, page }, use, testInfo) => {
      await applyNextFixture(use, {
        testInfo,
        nextWorker: _nextWorker,
        page,
        nextOptions,
      })
    },
    { auto: true },
  ],
})

export default test
