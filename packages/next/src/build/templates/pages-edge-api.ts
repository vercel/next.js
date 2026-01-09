import type { EdgeHandler } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { wrapApiHandler } from '../../server/api-utils'

// Import the userland code.
import handlerUserland from 'VAR_USERLAND'
import { toNodeOutgoingHttpHeaders } from '../../server/web/utils'
import type { RequestMeta } from '../../server/request-meta'

const page = 'VAR_DEFINITION_PAGE'

if (typeof handlerUserland !== 'function') {
  throw new Error(
    `The Edge Function "pages${page}" must export a \`default\` function`
  )
}

const internalHandler: EdgeHandler = (opts) => {
  return adapter({
    ...opts,
    IncrementalCache,
    page: 'VAR_DEFINITION_PATHNAME',
    handler: wrapApiHandler(page, handlerUserland),
  })
}

export async function handler(
  request: Request,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    signal?: AbortSignal
    requestMeta?: RequestMeta
  }
): Promise<Response> {
  const result = await internalHandler({
    request: {
      url: request.url,
      method: request.method,
      headers: toNodeOutgoingHttpHeaders(request.headers),
      nextConfig: {
        basePath: process.env.__NEXT_BASE_PATH,
        i18n: process.env.__NEXT_I18N_CONFIG as any,
        trailingSlash: Boolean(process.env.__NEXT_TRAILING_SLASH),
        experimental: {
          cacheLife: process.env.__NEXT_CACHE_LIFE as any,
          authInterrupts: Boolean(
            process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS
          ),
          clientParamParsingOrigins: process.env
            .__NEXT_CLIENT_PARAM_PARSING_ORIGINS as any,
        },
      },
      page: {
        name: 'VAR_DEFINITION_PATHNAME',
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? (request.body ?? undefined)
          : undefined,
      waitUntil: ctx.waitUntil,
      requestMeta: ctx.requestMeta,
      signal: ctx.signal || new AbortController().signal,
    },
  })

  ctx.waitUntil?.(result.waitUntil)

  return result.response
}

// backwards compat
export default internalHandler
