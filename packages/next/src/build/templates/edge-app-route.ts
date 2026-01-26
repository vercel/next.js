import { setManifestsSingleton } from '../../server/app-render/manifests-singleton'
import type { RequestMeta } from '../../server/request-meta'
import type { EdgeHandler } from '../../server/web/adapter'
import { EdgeRouteModuleWrapper } from '../../server/web/edge-route-module-wrapper'

// Import the userland code.
import * as module from 'VAR_USERLAND'
import { toNodeOutgoingHttpHeaders } from '../../server/web/utils'

// injected by the loader afterwards.

const maybeJSONParse = (str?: string) => (str ? JSON.parse(str) : undefined)

const rscManifest = self.__RSC_MANIFEST?.['VAR_PAGE']
const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)

if (rscManifest && rscServerManifest) {
  setManifestsSingleton({
    page: 'VAR_PAGE',
    clientReferenceManifest: rscManifest,
    serverActionsManifest: rscServerManifest,
  })
}

export const ComponentMod = module

const internalHandler: EdgeHandler = EdgeRouteModuleWrapper.wrap(
  module.routeModule,
  {
    page: 'VAR_PAGE',
  }
)

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
        name: 'VAR_PAGE',
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
