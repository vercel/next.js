import type { NextConfigComplete } from '../../../../server/config-shared'

import type { DocumentType, AppType } from '../../../../shared/lib/utils'
import type { BuildManifest } from '../../../../server/get-page-files'
import type {
  LoadComponentsReturnType,
  ReactLoadableManifest,
} from '../../../../server/load-components'
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

type LoadPageComponents = Pick<
  LoadComponentsReturnType,
  | 'Component'
  | 'pageConfig'
  | 'pageConfig'
  | 'getStaticPaths'
  | 'getStaticProps'
  | 'getServerSideProps'
  | 'ComponentMod'
  | 'routeModule'
  | 'isAppPath'
  | 'pathname'
>

function loadPageComponents(
  page: string,
  pathname: string,
  pageMod: any,
  errorMod: any,
  error500Mod: any
): LoadPageComponents | null {
  if (pathname === page) {
    return {
      Component: pageMod.default,
      pageConfig: pageMod.config || {},
      getStaticProps: pageMod.getStaticProps,
      getServerSideProps: pageMod.getServerSideProps,
      getStaticPaths: pageMod.getStaticPaths,
      ComponentMod: pageMod,
      isAppPath: !!pageMod.__next_app__,
      pathname,
      routeModule: pageMod.routeModule,
    }
  }

  // If there is a custom 500 page, we need to handle it separately.
  if (pathname === '/500' && error500Mod) {
    return {
      Component: error500Mod.default,
      pageConfig: error500Mod.config || {},
      getStaticProps: error500Mod.getStaticProps,
      getServerSideProps: error500Mod.getServerSideProps,
      getStaticPaths: error500Mod.getStaticPaths,
      ComponentMod: error500Mod,
      pathname,
      routeModule: error500Mod.routeModule,
    }
  }

  if (pathname === '/_error') {
    return {
      Component: errorMod.default,
      pageConfig: errorMod.config || {},
      getStaticProps: errorMod.getStaticProps,
      getServerSideProps: errorMod.getServerSideProps,
      getStaticPaths: errorMod.getStaticPaths,
      ComponentMod: errorMod,
      pathname,
      routeModule: errorMod.routeModule,
    }
  }

  return null
}

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
  const baseLoadComponentResult: Omit<
    LoadComponentsReturnType,
    keyof LoadPageComponents
  > = {
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
      normalizedPage: isAppPath ? normalizeAppPath(page) : page,
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
      loadComponent: async (
        pathname
      ): Promise<LoadComponentsReturnType | null> => {
        const components = loadPageComponents(
          page,
          pathname,
          pageMod,
          errorMod,
          error500Mod
        )

        if (components) {
          return { ...components, ...baseLoadComponentResult }
        }

        return null
      },
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
