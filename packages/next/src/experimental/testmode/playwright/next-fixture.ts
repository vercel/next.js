import type { Page, TestInfo } from '@playwright/test'
import type { NextWorkerFixture, FetchHandler } from './next-worker-fixture'
import type { NextOptions } from './next-options'
import type { FetchHandlerResult } from '../proxy'
import { handleRoute } from './page-route'

export interface NextFixture {
  onFetch: (handler: FetchHandler) => void
}

class NextFixtureImpl implements NextFixture {
  private fetchHandlers: FetchHandler[] = []

  constructor(
    public testId: string,
    private options: NextOptions,
    private worker: NextWorkerFixture,
    private page: Page
  ) {
    const testHeaders = {
      'Next-Test-Proxy-Port': String(worker.proxyPort),
      'Next-Test-Data': testId,
    }
    const handleFetch = this.handleFetch.bind(this)
    worker.onFetch(testId, handleFetch)
    this.page.route('**', (route) =>
      handleRoute(route, page, testHeaders, handleFetch)
    )
  }

  teardown(): void {
    this.worker.cleanupTest(this.testId)
  }

  onFetch(handler: FetchHandler): void {
    this.fetchHandlers.push(handler)
  }

  private async handleFetch(request: Request): Promise<FetchHandlerResult> {
    for (const handler of this.fetchHandlers.slice().reverse()) {
      const result = handler(request)
      if (result) {
        return result
      }
    }
    if (this.options.fetchLoopback) {
      return fetch(request)
    }
    return undefined
  }
}

export async function applyNextFixture(
  use: (fixture: NextFixture) => Promise<void>,
  {
    testInfo,
    nextOptions,
    nextWorker,
    page,
  }: {
    testInfo: TestInfo
    nextOptions: NextOptions
    nextWorker: NextWorkerFixture
    page: Page
  }
): Promise<void> {
  const fixture = new NextFixtureImpl(
    testInfo.testId,
    nextOptions,
    nextWorker,
    page
  )

  await use(fixture)

  fixture.teardown()
}
