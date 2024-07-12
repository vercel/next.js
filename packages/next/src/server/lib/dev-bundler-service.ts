import type { IncomingMessage } from 'http'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { WorkerRequestHandler } from './types'

import LRUCache from 'next/dist/compiled/lru-cache'
import { createRequestResponseMocks } from './mock-request'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../dev/hot-reloader-types'

/**
 * The DevBundlerService provides an interface to perform tasks with the
 * bundler while in development.
 */
export class DevBundlerService {
  // can't leverage LRU type directly here as it
  // isn't a direct dependency
  public appIsrManifestInner: {
    get(key: string): number | false
    set(key: string, value: number | false): void
    del(key: string): void
    keys(): string[]
  }

  constructor(
    private readonly bundler: DevBundler,
    private readonly handler: WorkerRequestHandler
  ) {
    this.appIsrManifestInner = new LRUCache({
      max: 8_000,
      length() {
        return 16
      },
    }) as any
  }

  public ensurePage: typeof this.bundler.hotReloader.ensurePage = async (
    definition
  ) => {
    // TODO: remove after ensure is pulled out of server
    return await this.bundler.hotReloader.ensurePage(definition)
  }

  public logErrorWithOriginalStack: typeof this.bundler.logErrorWithOriginalStack =
    async (...args) => {
      return await this.bundler.logErrorWithOriginalStack(...args)
    }

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
      !(mocked.res.statusCode === 404 && revalidateOpts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${mocked.res.statusCode}`)
    }

    return {}
  }

  public get appIsrManifest() {
    const serializableManifest: Record<string, false | number> = {}

    for (const key of this.appIsrManifestInner.keys() as string[]) {
      serializableManifest[key] = this.appIsrManifestInner.get(key) as
        | false
        | number
    }
    return serializableManifest
  }

  public setAppIsrStatus(key: string, value: false | number | null) {
    if (value === null) {
      this.appIsrManifestInner.del(key)
    } else {
      this.appIsrManifestInner.set(key, value)
    }
    this.bundler?.hotReloader?.send({
      action: HMR_ACTIONS_SENT_TO_BROWSER.APP_ISR_MANIFEST,
      data: this.appIsrManifest,
    })
  }
}
