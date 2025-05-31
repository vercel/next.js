import type { NextConfigComplete } from '../../../../server/config-shared'

import type { DocumentType, AppType } from '../../../../shared/lib/utils'
import type { BuildManifest } from '../../../../server/get-page-files'
import type {
  DynamicCssManifest,
  ReactLoadableManifest,
} from '../../../../server/load-components'
import type { ClientReferenceManifest } from '../../plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../plugins/next-font-manifest-plugin'
import type { NextFetchEvent } from '../../../../server/web/spec-extension/fetch-event'

import WebServer from '../../../../server/web-server'
import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'
import { SERVER_RUNTIME } from '../../../../lib/constants'
import type { ManifestRewriteRoute } from '../../..'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import type { SizeLimit } from '../../../../types'
import { internal_getCurrentFunctionWaitUntil } from '../../../../server/web/internal-edge-wait-until'
import type { PAGE_TYPES } from '../../../../lib/page-types'
import type { NextRequestHint } from '../../../../server/web/adapter'

export function getRender({
  dev,
  page,
  appMod,
  pageMod,
  errorMod,
  error500Mod,
  pagesType,
  Document,
  buildManifest,
  reactLoadableManifest,
  dynamicCssManifest,
  interceptionRouteRewrites,
  renderToHTML,
  clientReferenceManifest,
  subresourceIntegrityManifest,
  serverActionsManifest,
  serverActions,
  config,
  buildId,
  nextFontManifest,
  incrementalCacheHandler,
}: {
  pagesType: PAGE_TYPES
  dev: boolean
  page: string
  appMod: any
  pageMod: any
  errorMod: any
  error500Mod: any
  renderToHTML?: any
  Document: DocumentType
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  dynamicCssManifest?: DynamicCssManifest
  subresourceIntegrityManifest?: Record<string, string>
  interceptionRouteRewrites?: ManifestRewriteRoute[]
  clientReferenceManifest?: ClientReferenceManifest
  serverActionsManifest?: any
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
  config: NextConfigComplete
  buildId: string
  nextFontManifest: NextFontManifest
  incrementalCacheHandler?: any
}) {
  const isAppPath = pagesType === 'app'
  const baseLoadComponentResult = {
    dev,
    buildManifest,
    reactLoadableManifest,
    dynamicCssManifest,
    subresourceIntegrityManifest,
    Document,
    App: appMod?.default as AppType,
    clientReferenceManifest,
  }

  const server = new WebServer({
    dev,
    buildId,
    conf: config,
    minimalMode: true,
    webServerConfig: {
      page,
      pathname: isAppPath ? normalizeAppPath(page) : page,
      pagesType,
      interceptionRouteRewrites,
      extendRenderOpts: {
        runtime: SERVER_RUNTIME.experimentalEdge,
        supportsDynamicResponse: true,
        disableOptimizedLoading: true,
        serverActionsManifest,
        serverActions,
        nextFontManifest,
      },
      renderToHTML,
      incrementalCacheHandler,
      loadComponent: async (inputPage) => {
        if (inputPage === page) {
          return {
            ...baseLoadComponentResult,
            Component: pageMod.default,
            pageConfig: pageMod.config || {},
            getStaticProps: pageMod.getStaticProps,
            getServerSideProps: pageMod.getServerSideProps,
            getStaticPaths: pageMod.getStaticPaths,
            ComponentMod: pageMod,
            isAppPath: !!pageMod.__next_app__,
            page: inputPage,
            routeModule: pageMod.routeModule,
          }
        }

        // If there is a custom 500 page, we need to handle it separately.
        if (inputPage === '/500' && error500Mod) {
          return {
            ...baseLoadComponentResult,
            Component: error500Mod.default,
            pageConfig: error500Mod.config || {},
            getStaticProps: error500Mod.getStaticProps,
            getServerSideProps: error500Mod.getServerSideProps,
            getStaticPaths: error500Mod.getStaticPaths,
            ComponentMod: error500Mod,
            page: inputPage,
            routeModule: error500Mod.routeModule,
          }
        }

        if (inputPage === '/_error') {
          return {
            ...baseLoadComponentResult,
            Component: errorMod.default,
            pageConfig: errorMod.config || {},
            getStaticProps: errorMod.getStaticProps,
            getServerSideProps: errorMod.getServerSideProps,
            getStaticPaths: errorMod.getStaticPaths,
            ComponentMod: errorMod,
            page: inputPage,
            routeModule: errorMod.routeModule,
          }
        }

        return null
      },
    },
  })

  const handler = server.getRequestHandler()

  return async function render(
    request: NextRequestHint,
    event?: NextFetchEvent
  ) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse(undefined)

    handler(extendedReq, extendedRes)
    const result = await extendedRes.toResponse()
    request.fetchMetrics = extendedReq.fetchMetrics

    if (event?.waitUntil) {
      // TODO(after):
      // remove `internal_runWithWaitUntil` and the `internal-edge-wait-until` module
      // when consumers switch to `after`.
      const waitUntilPromise = internal_getCurrentFunctionWaitUntil()
      if (waitUntilPromise) {
        event.waitUntil(waitUntilPromise)
      }
    }

    return result
  }
}
