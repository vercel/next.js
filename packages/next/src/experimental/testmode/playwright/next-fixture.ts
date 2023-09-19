import type { Page, TestInfo } from '@playwright/test'
import type { NextWorkerFixture, FetchHandler } from './next-worker-fixture'
import type { NextOptions } from './next-options'
import type { FetchHandlerResult } from '../proxy'
import { handleRoute } from './page-route'
import { reportFetch } from './report'

export interface NextFixture {
  onFetch: (handler: FetchHandler) => void
}

class NextFixtureImpl implements NextFixture {
  public readonly testId: string
  private fetchHandlers: FetchHandler[] = []

  constructor(
    private testInfo: TestInfo,
    private options: NextOptions,
    private worker: NextWorkerFixture,
    private page: Page
  ) {
    this.testId = testInfo.testId
    const testHeaders = {
      'Next-Test-Proxy-Port': String(worker.proxyPort),
      'Next-Test-Data': this.testId,
    }
    const handleFetch = this.handleFetch.bind(this)
    worker.onFetch(this.testId, handleFetch)
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
    return reportFetch(this.testInfo, request, async (req) => {
      for (const handler of this.fetchHandlers.slice().reverse()) {
        const result = await handler(req.clone())
        if (result) {
          return result
        }
      }
      if (this.options.fetchLoopback) {
        return fetch(req.clone())
      }
      return undefined
    })
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
  const fixture = new NextFixtureImpl(testInfo, nextOptions, nextWorker, page)

  await use(fixture)

  fixture.teardown()
}
