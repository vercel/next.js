import type { IncomingMessage } from 'http'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { WorkerRequestHandler } from './types'

import { createRequestResponseMocks } from './mock-request'

/**
 * The DevBundlerService provides an interface to perform tasks with the
 * bundler while in development.
 */
export class DevBundlerService {
  constructor(
    private readonly bundler: DevBundler,
    private readonly handler: WorkerRequestHandler
  ) {}

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
}
