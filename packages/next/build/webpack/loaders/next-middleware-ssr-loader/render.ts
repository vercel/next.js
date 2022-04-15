import type { NextConfig } from '../../../../server/config-shared'
import type { DocumentType, AppType } from '../../../../shared/lib/utils'
import type { BuildManifest } from '../../../../server/get-page-files'
import type { ReactLoadableManifest } from '../../../../server/load-components'

import { NextRequest } from '../../../../server/web/spec-extension/request'

import WebServer from '../../../../server/web-server'
import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'

// Polyfilled for `path-browserify` inside the Web Server.
process.cwd = () => ''

export function getRender({
  dev,
  page,
  appMod,
  pageMod,
  errorMod,
  error500Mod,
  Document,
  buildManifest,
  reactLoadableManifest,
  serverComponentManifest,
  config,
  buildId,
  appServerMod,
}: {
  dev: boolean
  page: string
  appMod: any
  pageMod: any
  errorMod: any
  error500Mod: any
  Document: DocumentType
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  serverComponentManifest: any
  appServerMod: any
  config: NextConfig
  buildId: string
}) {
  const baseLoadComponentResult = {
    dev,
    buildManifest,
    reactLoadableManifest,
    Document,
    App: appMod.default as AppType,
    AppMod: appMod,
    AppServerMod: appServerMod,
  }

  const server = new WebServer({
    conf: config,
    minimalMode: true,
    webServerConfig: {
      extendRenderOpts: {
        buildId,
        reactRoot: true,
        runtime: 'edge',
        supportsDynamicHTML: true,
        disableOptimizedLoading: true,
        serverComponentManifest,
      },
      loadComponent: async (pathname) => {
        if (pathname === page) {
          return {
            ...baseLoadComponentResult,
            Component: pageMod.default,
            pageConfig: pageMod.config || {},
            getStaticProps: pageMod.getStaticProps,
            getServerSideProps: pageMod.getServerSideProps,
            getStaticPaths: pageMod.getStaticPaths,
            ComponentMod: pageMod,
          }
        }

        // If there is a custom 500 page, we need to handle it separately.
        if (pathname === '/500' && error500Mod) {
          return {
            ...baseLoadComponentResult,
            Component: error500Mod.default,
            pageConfig: error500Mod.config || {},
            getStaticProps: error500Mod.getStaticProps,
            getServerSideProps: error500Mod.getServerSideProps,
            getStaticPaths: error500Mod.getStaticPaths,
            ComponentMod: error500Mod,
          }
        }

        if (pathname === '/_error') {
          return {
            ...baseLoadComponentResult,
            Component: errorMod.default,
            pageConfig: errorMod.config || {},
            getStaticProps: errorMod.getStaticProps,
            getServerSideProps: errorMod.getServerSideProps,
            getStaticPaths: errorMod.getStaticPaths,
            ComponentMod: errorMod,
          }
        }

        return null
      },
    },
  })
  const requestHandler = server.getRequestHandler()

  return async function render(request: NextRequest) {
    // Preflight request
    if (request.method === 'HEAD') {
      // Hint the client that the matched route is a SSR page.
      return new Response(null, {
        headers: {
          'x-middleware-ssr': '1',
        },
      })
    }

    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()
    requestHandler(extendedReq, extendedRes)
    return await extendedRes.toResponse()
  }
}
