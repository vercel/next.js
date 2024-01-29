import type { NextConfigComplete } from '../../../../server/config-shared'

import type { DocumentType, AppType } from '../../../../shared/lib/utils'
import type { BuildManifest } from '../../../../server/get-page-files'
import type { ReactLoadableManifest } from '../../../../server/load-components'
import type { ClientReferenceManifest } from '../../plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../plugins/next-font-manifest-plugin'
import type { NextFetchEvent } from '../../../../server/web/spec-extension/fetch-event'

import WebServer from '../../../../server/web-server'
import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'
import { SERVER_RUNTIME } from '../../../../lib/constants'
import type { PrerenderManifest } from '../../..'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import type { SizeLimit } from '../../../../../types'
import { internal_getCurrentFunctionWaitUntil } from '../../../../server/web/internal-edge-wait-until'
import type { PAGE_TYPES } from '../../../../lib/page-types'

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
  prerenderManifest,
  reactLoadableManifest,
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
  prerenderManifest: PrerenderManifest
  reactLoadableManifest: ReactLoadableManifest
  subresourceIntegrityManifest?: Record<string, string>
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
    subresourceIntegrityManifest,
    Document,
    App: appMod?.default as AppType,
    clientReferenceManifest,
  }

  const server = new WebServer({
    dev,
    conf: config,
    minimalMode: true,
    webServerConfig: {
      page,
      pathname: isAppPath ? normalizeAppPath(page) : page,
      pagesType,
      prerenderManifest,
      extendRenderOpts: {
        buildId,
        runtime: SERVER_RUNTIME.experimentalEdge,
        supportsDynamicHTML: true,
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

  return async function render(request: Request, event: NextFetchEvent) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()

    handler(extendedReq, extendedRes)
    const result = await extendedRes.toResponse()

    if (event && event.waitUntil) {
      const waitUntilPromise = internal_getCurrentFunctionWaitUntil()
      if (waitUntilPromise) {
        event.waitUntil(waitUntilPromise)
      }
    }

    // fetchMetrics is attached to the web request that going through the server,
    // wait for the handler result is ready and attach it back to the original request.
    ;(request as any).fetchMetrics = extendedReq.fetchMetrics
    return result
  }
}
