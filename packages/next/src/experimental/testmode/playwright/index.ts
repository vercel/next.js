import { test as base } from '@playwright/test'
import type { NextFixture } from './next-fixture'
import type { NextWorkerFixture } from './next-worker-fixture'
import { applyNextWorkerFixture } from './next-worker-fixture'
import { applyNextFixture } from './next-fixture'

export * from '@playwright/test'

export type { NextFixture }
export type { FetchHandlerResult } from '../proxy'

export const test = base.extend<
  { next: NextFixture },
  { _nextWorker: NextWorkerFixture }
>({
  _nextWorker: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await applyNextWorkerFixture(use)
    },
    { scope: 'worker', auto: true },
  ],

  next: async ({ _nextWorker, page, extraHTTPHeaders }, use, testInfo) => {
    await applyNextFixture(use, {
      testInfo,
      nextWorker: _nextWorker,
      page,
      extraHTTPHeaders,
    })
  },
})

export default test
