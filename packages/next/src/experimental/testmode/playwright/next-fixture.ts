import type { Page, TestInfo } from '@playwright/test'
import type { NextWorkerFixture, FetchHandler } from './next-worker-fixture'
import type { NextOptions } from './next-options'
import type { FetchHandlerResult } from '../proxy'
import { handleRoute } from './page-route'

export interface NextFixture {
  onFetch: (handler: FetchHandler) => void
}

class NextFixtureImpl implements NextFixture {
  private fetchHandler: FetchHandler | null = null

  constructor(
    public testId: string,
    private options: NextOptions,
    private worker: NextWorkerFixture,
    private page: Page
  ) {
    const handleFetch = this.handleFetch.bind(this)
    worker.onFetch(testId, handleFetch)
    this.page.route('**', (route) => handleRoute(route, page, handleFetch))
  }

  teardown(): void {
    this.worker.cleanupTest(this.testId)
  }

  onFetch(handler: FetchHandler): void {
    this.fetchHandler = handler
  }

  private async handleFetch(request: Request): Promise<FetchHandlerResult> {
    const handler = this.fetchHandler
    if (handler) {
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
    extraHTTPHeaders,
  }: {
    testInfo: TestInfo
    nextOptions: NextOptions
    nextWorker: NextWorkerFixture
    page: Page
    extraHTTPHeaders: Record<string, string> | undefined
  }
): Promise<void> {
  const fixture = new NextFixtureImpl(
    testInfo.testId,
    nextOptions,
    nextWorker,
    page
  )
  page.setExtraHTTPHeaders({
    ...extraHTTPHeaders,
    'Next-Test-Proxy-Port': String(nextWorker.proxyPort),
    'Next-Test-Data': fixture.testId,
  })

  await use(fixture)

  fixture.teardown()
}
