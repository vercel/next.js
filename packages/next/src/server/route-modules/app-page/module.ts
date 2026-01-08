import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type RenderResult from '../../render-result'
import type { RenderOpts } from '../../app-render/types'
import { addRequestMeta, type NextParsedUrlQuery } from '../../request-meta'
import type { LoaderTree } from '../../lib/app-dir-module'
import type { PrerenderManifest } from '../../../build'

import {
  renderToHTMLOrFlight,
  type AppSharedContext,
} from '../../app-render/app-render'
import {
  RouteModule,
  type RouteModuleOptions,
  type RouteModuleHandleContext,
} from '../route-module'
import * as vendoredContexts from './vendored/contexts/entrypoints'
import type { BaseNextRequest, BaseNextResponse } from '../../base-http'
import type { ServerComponentsHmrCache } from '../../response-cache'
import type { OpaqueFallbackRouteParams } from '../../request/fallback-params'
import { PrerenderManifestMatcher } from './helpers/prerender-manifest-matcher'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_HEADER,
} from '../../../client/components/app-router-headers'
import { isInterceptionRouteAppPath } from '../../../shared/lib/router/utils/interception-routes'
import { RSCPathnameNormalizer } from '../../normalizers/request/rsc'
import { SegmentPrefixRSCPathnameNormalizer } from '../../normalizers/request/segment-prefix-rsc'
import type { UrlWithParsedQuery } from 'url'
import type { IncomingMessage } from 'http'

let vendoredReactRSC
let vendoredReactSSR

// the vendored Reacts are loaded from their original source in the edge runtime
if (process.env.NEXT_RUNTIME !== 'edge') {
  vendoredReactRSC =
    require('./vendored/rsc/entrypoints') as typeof import('./vendored/rsc/entrypoints')
  vendoredReactSSR =
    require('./vendored/ssr/entrypoints') as typeof import('./vendored/ssr/entrypoints')

  // In Node environments we need to access the correct React instance from external modules such
  // as global patches. We register the loaded React instances here.
  const { registerServerReact, registerClientReact } =
    require('../../runtime-reacts.external') as typeof import('../../runtime-reacts.external')
  registerServerReact(vendoredReactRSC.React)
  registerClientReact(vendoredReactSSR.React)
}

/**
 * The AppPageModule is the type of the module exported by the bundled app page
 * module.
 */
export type AppPageModule = typeof import('../../../build/templates/app-page')

type AppPageUserlandModule = {
  /**
   * The tree created in next-app-loader that holds component segments and modules
   */
  loaderTree: LoaderTree
}

export interface AppPageRouteHandlerContext extends RouteModuleHandleContext {
  page: string
  query: NextParsedUrlQuery
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  renderOpts: RenderOpts
  serverComponentsHmrCache?: ServerComponentsHmrCache
  sharedContext: AppSharedContext
}

export type AppPageRouteModuleOptions = RouteModuleOptions<
  AppPageRouteDefinition,
  AppPageUserlandModule
>

export class AppPageRouteModule extends RouteModule<
  AppPageRouteDefinition,
  AppPageUserlandModule
> {
  private matchers = new WeakMap<
    DeepReadonly<PrerenderManifest>,
    PrerenderManifestMatcher
  >()
  public match(
    pathname: string,
    prerenderManifest: DeepReadonly<PrerenderManifest>
  ) {
    // Lazily create the matcher based on the provided prerender manifest.
    let matcher = this.matchers.get(prerenderManifest)
    if (!matcher) {
      matcher = new PrerenderManifestMatcher(
        this.definition.pathname,
        prerenderManifest
      )
      this.matchers.set(prerenderManifest, matcher)
    }

    // Match the pathname to the dynamic route.
    return matcher.match(pathname)
  }

  private normalizers = {
    rsc: new RSCPathnameNormalizer(),
    segmentPrefetchRSC: new SegmentPrefixRSCPathnameNormalizer(),
  }

  public normalizeUrl(
    req: IncomingMessage | BaseNextRequest,
    parsedUrl: UrlWithParsedQuery
  ) {
    if (this.normalizers.segmentPrefetchRSC.match(parsedUrl.pathname || '/')) {
      const result = this.normalizers.segmentPrefetchRSC.extract(
        parsedUrl.pathname || '/'
      )
      if (!result) return false

      const { originalPathname, segmentPath } = result
      parsedUrl.pathname = originalPathname

      // Mark the request as a router prefetch request.
      req.headers[RSC_HEADER] = '1'
      req.headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
      req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] = segmentPath

      addRequestMeta(req, 'isRSCRequest', true)
      addRequestMeta(req, 'isPrefetchRSCRequest', true)
      addRequestMeta(req, 'segmentPrefetchRSCRequest', segmentPath)
    } else if (this.normalizers.rsc.match(parsedUrl.pathname || '/')) {
      parsedUrl.pathname = this.normalizers.rsc.normalize(
        parsedUrl.pathname || '/',
        true
      )

      // Mark the request as a RSC request.
      req.headers[RSC_HEADER] = '1'
      addRequestMeta(req, 'isRSCRequest', true)
    } else {
      super.normalizeUrl(req, parsedUrl)
    }
  }

  public render(
    req: BaseNextRequest,
    res: BaseNextResponse,
    context: AppPageRouteHandlerContext
  ): Promise<RenderResult> {
    return renderToHTMLOrFlight(
      req,
      res,
      context.page,
      context.query,
      context.fallbackRouteParams,
      context.renderOpts,
      context.serverComponentsHmrCache,
      context.sharedContext
    )
  }

  private pathCouldBeIntercepted(
    resolvedPathname: string,
    interceptionRoutePatterns: RegExp[]
  ): boolean {
    return (
      isInterceptionRouteAppPath(resolvedPathname) ||
      interceptionRoutePatterns.some((regexp) => {
        return regexp.test(resolvedPathname)
      })
    )
  }

  public getVaryHeader(
    resolvedPathname: string,
    interceptionRoutePatterns: RegExp[]
  ): string {
    const baseVaryHeader = `${RSC_HEADER}, ${NEXT_ROUTER_STATE_TREE_HEADER}, ${NEXT_ROUTER_PREFETCH_HEADER}, ${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}`

    if (
      this.pathCouldBeIntercepted(resolvedPathname, interceptionRoutePatterns)
    ) {
      // Interception route responses can vary based on the `Next-URL` header.
      // We use the Vary header to signal this behavior to the client to properly cache the response.
      return `${baseVaryHeader}, ${NEXT_URL}`
    } else {
      // We don't need to include `Next-URL` in the Vary header for non-interception routes since it won't affect the response.
      // We also set this header for pages to avoid caching issues when navigating between pages and app.
      return baseVaryHeader
    }
  }
}

const vendored = {
  'react-rsc': vendoredReactRSC,
  'react-ssr': vendoredReactSSR,
  contexts: vendoredContexts,
}

export { renderToHTMLOrFlight, vendored }

export default AppPageRouteModule
