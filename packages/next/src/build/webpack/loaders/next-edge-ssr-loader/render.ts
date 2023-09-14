import type { NextConfigComplete } from '../../../../server/config-shared'

import type { DocumentType, AppType } from '../../../../shared/lib/utils'
import type { BuildManifest } from '../../../../server/get-page-files'
import type { ReactLoadableManifest } from '../../../../server/load-components'
import type { ClientReferenceManifest } from '../../plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../plugins/next-font-manifest-plugin'

import WebServer from '../../../../server/web-server'
import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'
import { SERVER_RUNTIME } from '../../../../lib/constants'
import { PrerenderManifest } from '../../..'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { SizeLimit } from '../../../../../types'
import { WebRouteManager } from '../../../../server/future/route-manager/web-route-manager'

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
  serverActionsBodySizeLimit,
  config,
  buildId,
  nextFontManifest,
  incrementalCacheHandler,
}: {
  pagesType: 'app' | 'pages' | 'root'
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
  serverActionsManifest: any
  serverActionsBodySizeLimit?: SizeLimit
  appServerMod: any
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
        serverActionsBodySizeLimit,
        nextFontManifest,
      },
      renderToHTML,
      incrementalCacheHandler,
      routes: new WebRouteManager({
        page,
        pathname: isAppPath ? normalizeAppPath(page) : page,
        pagesType,
        componentsLoader: {
          load: async (definition) => {
            if (definition.page === page) {
              return {
                ...baseLoadComponentResult,
                Component: pageMod.default,
                pageConfig: pageMod.config || {},
                getStaticProps: pageMod.getStaticProps,
                getServerSideProps: pageMod.getServerSideProps,
                getStaticPaths: pageMod.getStaticPaths,
                ComponentMod: pageMod,
                isAppPath: !!pageMod.__next_app__,
                page: definition.page,
                routeModule: pageMod.routeModule,
              }
            }

            // If there is a custom 500 page, we need to handle it separately.
            if (definition.page === '/500' && error500Mod) {
              return {
                ...baseLoadComponentResult,
                Component: error500Mod.default,
                pageConfig: error500Mod.config || {},
                getStaticProps: error500Mod.getStaticProps,
                getServerSideProps: error500Mod.getServerSideProps,
                getStaticPaths: error500Mod.getStaticPaths,
                ComponentMod: error500Mod,
                page: definition.page,
                routeModule: error500Mod.routeModule,
              }
            }

            if (definition.page === '/_error') {
              return {
                ...baseLoadComponentResult,
                Component: errorMod.default,
                pageConfig: errorMod.config || {},
                getStaticProps: errorMod.getStaticProps,
                getServerSideProps: errorMod.getServerSideProps,
                getStaticPaths: errorMod.getStaticPaths,
                ComponentMod: errorMod,
                page: definition.page,
                routeModule: errorMod.routeModule,
              }
            }

            return null
          },
        },
        error500Mod,
        errorMod,
      }),
    },
  })

  const handler = server.getRequestHandler()

  return async function render(request: Request) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()

    handler(extendedReq, extendedRes)

    return await extendedRes.toResponse()
  }
}
