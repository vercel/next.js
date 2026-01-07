import type { NextConfigComplete } from '../server/config-shared'
import type { CustomRoutes } from '../lib/load-custom-routes'
import {
  RSC_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
} from '../client/components/app-router-headers'
import {
  RSC_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
  NEXT_RESUME_HEADER,
} from '../lib/constants'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { buildCustomRoute } from '../lib/build-custom-route'
import { isReservedPage, pageToRoute } from './utils'
import type { DynamicManifestRoute } from './utils'
import type { RoutesManifest, ManifestRoute } from './index'
import { sortPages } from '../shared/lib/router/utils/sortable-routes'

export interface GenerateRoutesManifestOptions {
  pageKeys: {
    pages: string[]
    app?: string[]
  }
  config: NextConfigComplete
  redirects: CustomRoutes['redirects']
  headers: CustomRoutes['headers']
  rewrites: CustomRoutes['rewrites']
  restrictedRedirectPaths: string[]
  isAppPPREnabled: boolean
  appType: 'pages' | 'app' | 'hybrid'
}

export interface GenerateRoutesManifestResult {
  routesManifest: RoutesManifest
  dynamicRoutes: Array<DynamicManifestRoute>
  sourcePages: Map<string, string>
}

/**
 * Generates the routes manifest from the given page keys and configuration.
 * This function extracts the route manifest generation logic to be reusable
 * across different build contexts (webpack build, turbopack build, analyze, etc.)
 */
export function generateRoutesManifest(
  options: GenerateRoutesManifestOptions
): GenerateRoutesManifestResult {
  const {
    pageKeys,
    config,
    redirects,
    headers,
    rewrites,
    restrictedRedirectPaths,
    isAppPPREnabled,
    appType,
  } = options

  const sortedRoutes = sortPages([...pageKeys.pages, ...(pageKeys.app ?? [])])
  const staticRoutes: Array<ManifestRoute> = []
  const dynamicRoutes: Array<DynamicManifestRoute> = []

  /**
   * A map of all the pages to their sourcePage value. This is only used for
   * routes that have PPR enabled and clientSegmentEnabled is true.
   */
  const sourcePages = new Map<string, string>()

  for (const route of sortedRoutes) {
    if (isDynamicRoute(route)) {
      dynamicRoutes.push(
        pageToRoute(
          route,
          // This property is only relevant when PPR is enabled.
          undefined
        )
      )
    } else if (
      !isReservedPage(route) ||
      // don't consider /api reserved here
      route.match(/^\/(api(\/|$))/)
    ) {
      staticRoutes.push(pageToRoute(route))
    }
  }

  const routesManifest: RoutesManifest = {
    version: 3,
    pages404: true,
    appType,
    caseSensitive: !!config.experimental.caseSensitiveRoutes,
    basePath: config.basePath,
    redirects: redirects.map((r) =>
      buildCustomRoute('redirect', r, restrictedRedirectPaths)
    ),
    headers: headers.map((r) => buildCustomRoute('header', r)),
    rewrites: {
      beforeFiles: rewrites.beforeFiles.map((r) =>
        buildCustomRoute('rewrite', r)
      ),
      afterFiles: rewrites.afterFiles.map((r) =>
        buildCustomRoute('rewrite', r)
      ),
      fallback: rewrites.fallback.map((r) => buildCustomRoute('rewrite', r)),
    },
    dynamicRoutes,
    staticRoutes,
    dataRoutes: [],
    i18n: config.i18n || undefined,
    rsc: {
      header: RSC_HEADER,
      // This vary header is used as a default. It is technically re-assigned in `base-server`,
      // and may include an additional Vary option for `Next-URL`.
      varyHeader: `${RSC_HEADER}, ${NEXT_ROUTER_STATE_TREE_HEADER}, ${NEXT_ROUTER_PREFETCH_HEADER}, ${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}`,
      prefetchHeader: NEXT_ROUTER_PREFETCH_HEADER,
      didPostponeHeader: NEXT_DID_POSTPONE_HEADER,
      contentTypeHeader: RSC_CONTENT_TYPE_HEADER,
      suffix: RSC_SUFFIX,
      prefetchSegmentHeader: NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
      prefetchSegmentSuffix: RSC_SEGMENT_SUFFIX,
      prefetchSegmentDirSuffix: RSC_SEGMENTS_DIR_SUFFIX,
      clientParamParsing: config.cacheComponents ?? false,
      clientParamParsingOrigins: config.experimental.clientParamParsingOrigins,
      dynamicRSCPrerender: isAppPPREnabled && config.cacheComponents === true,
    },
    rewriteHeaders: {
      pathHeader: NEXT_REWRITTEN_PATH_HEADER,
      queryHeader: NEXT_REWRITTEN_QUERY_HEADER,
    },
    skipProxyUrlNormalize: config.skipProxyUrlNormalize,
    ppr: isAppPPREnabled
      ? {
          chain: {
            headers: {
              [NEXT_RESUME_HEADER]: '1',
            },
          },
        }
      : undefined,
  }

  return {
    routesManifest,
    dynamicRoutes,
    sourcePages,
  }
}
