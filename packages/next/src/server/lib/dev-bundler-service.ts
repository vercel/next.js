import type { IncomingMessage } from 'http'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { WorkerRequestHandler } from './types'

import { LRUCache } from './lru-cache'
import { createRequestResponseMocks } from './mock-request'
import { HMR_MESSAGE_SENT_TO_BROWSER } from '../dev/hot-reloader-types'
import type { ReactDebugChannelForBrowser } from '../dev/debug-channel'
import type { ServerCacheStatus } from '../../next-devtools/dev-overlay/cache-indicator'

/**
 * The DevBundlerService provides an interface to perform tasks with the
 * bundler while in development.
 */
export class DevBundlerService {
  public appIsrManifestInner: InstanceType<typeof LRUCache<boolean>>

  constructor(
    private readonly bundler: DevBundler,
    private readonly handler: WorkerRequestHandler
  ) {
    this.appIsrManifestInner = new LRUCache(
      8_000,

      function length() {
        return 16
      }
    )
  }

  public ensurePage: typeof this.bundler.hotReloader.ensurePage = async (
    definition
  ) => {
    // TODO: remove after ensure is pulled out of server
    return await this.bundler.hotReloader.ensurePage(definition)
  }

  public logErrorWithOriginalStack =
    this.bundler.logErrorWithOriginalStack.bind(this.bundler)

  public async getFallbackErrorComponents(url?: string) {
    await this.bundler.hotReloader.buildFallbackError()
    // Build the error page to ensure the fallback is built too.
    // TODO: See if this can be moved into hotReloader or removed.
    await this.bundler.hotReloader.ensurePage({
      page: '/_error',
      clientOnly: false,
      definition: undefined,
      url,
    })
  }

  public async getCompilationError(page: string) {
    const errors = await this.bundler.hotReloader.getCompilationErrors(page)
    if (!errors) return

    // Return the very first error we found.
    return errors[0]
  }

  public async revalidate({
    urlPath,
    revalidateHeaders,
    opts: revalidateOpts,
  }: {
    urlPath: string
    revalidateHeaders: IncomingMessage['headers']
    opts: any
  }) {
    const mocked = createRequestResponseMocks({
      url: urlPath,
      headers: revalidateHeaders,
    })

    await this.handler(mocked.req, mocked.res)
    await mocked.res.hasStreamed

    if (
      mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
      mocked.res.statusCode !== 200 &&
      !(mocked.res.statusCode === 404 && revalidateOpts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${mocked.res.statusCode}`)
    }

    return {}
  }

  public get appIsrManifest() {
    const serializableManifest: Record<string, boolean> = {}

    for (const [key, value] of this.appIsrManifestInner) {
      serializableManifest[key] = value
    }

    return serializableManifest
  }

  public setCacheStatus(
    status: ServerCacheStatus,
    htmlRequestId: string,
    requestId: string
  ): void {
    this.bundler.hotReloader.setCacheStatus(status, htmlRequestId, requestId)
  }

  public setIsrStatus(key: string, value: boolean | undefined) {
    if (value === undefined) {
      this.appIsrManifestInner.remove(key)
    } else {
      this.appIsrManifestInner.set(key, value)
    }

    // Only send the ISR manifest to legacy clients, i.e. Pages Router clients,
    // or App Router clients that have Cache Components disabled. The ISR
    // manifest is only used to inform the static indicator, which currently
    // does not provide useful information if Cache Components is enabled due to
    // its binary nature (i.e. it does not support showing info for partially
    // static pages).
    this.bundler?.hotReloader?.sendToLegacyClients({
      type: HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST,
      data: this.appIsrManifest,
    })
  }

  public setReactDebugChannel(
    debugChannel: ReactDebugChannelForBrowser,
    htmlRequestId: string,
    requestId: string
  ): void {
    this.bundler.hotReloader.setReactDebugChannel(
      debugChannel,
      htmlRequestId,
      requestId
    )
  }

  public close() {
    this.bundler.hotReloader.close()
  }
}
