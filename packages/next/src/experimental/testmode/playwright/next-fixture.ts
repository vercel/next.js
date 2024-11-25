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
    worker.onFetch(this.testId, this.handleFetch.bind(this))
  }

  async setup(): Promise<void> {
    const testHeaders = {
      'Next-Test-Proxy-Port': String(this.worker.proxyPort),
      'Next-Test-Data': this.testId,
    }

    await this.page
      .context()
      .route('**', (route) =>
        handleRoute(route, this.page, testHeaders, this.handleFetch.bind(this))
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

  await fixture.setup()
  // eslint-disable-next-line react-hooks/rules-of-hooks -- not React.use()
  await use(fixture)

  fixture.teardown()
}
