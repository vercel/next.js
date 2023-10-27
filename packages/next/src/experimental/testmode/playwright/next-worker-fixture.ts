import type { FetchHandlerResult, ProxyServer } from '../proxy'
import { createProxyServer } from '../proxy'

export type FetchHandler = (
  request: Request
) => FetchHandlerResult | Promise<FetchHandlerResult>

export interface NextWorkerFixture {
  proxyPort: number
  onFetch: (testId: string, handler: FetchHandler) => void
  cleanupTest: (testId: string) => void
}

class NextWorkerFixtureImpl implements NextWorkerFixture {
  public proxyPort: number = 0
  private proxyServer: ProxyServer | null = null
  private proxyFetchMap = new Map<string, FetchHandler>()

  async setup(): Promise<void> {
    const server = await createProxyServer({
      onFetch: this.handleProxyFetch.bind(this),
    })

    this.proxyPort = server.port
    this.proxyServer = server
  }

  teardown(): void {
    if (this.proxyServer) {
      this.proxyServer.close()
      this.proxyServer = null
    }
  }

  cleanupTest(testId: string): void {
    this.proxyFetchMap.delete(testId)
  }

  onFetch(testId: string, handler: FetchHandler): void {
    this.proxyFetchMap.set(testId, handler)
  }

  private async handleProxyFetch(
    testId: string,
    request: Request
  ): Promise<FetchHandlerResult> {
    const handler = this.proxyFetchMap.get(testId)
    return handler?.(request)
  }
}

export async function applyNextWorkerFixture(
  use: (fixture: NextWorkerFixture) => Promise<void>
): Promise<void> {
  const fixture = new NextWorkerFixtureImpl()
  await fixture.setup()
  await use(fixture)
  fixture.teardown()
}
