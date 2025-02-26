import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type RenderResult from '../../render-result'
import type { RenderOpts } from '../../app-render/types'
import type { NextParsedUrlQuery } from '../../request-meta'
import type { LoaderTree } from '../../lib/app-dir-module'

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
import type { FallbackRouteParams } from '../../request/fallback-params'

let vendoredReactRSC
let vendoredReactSSR

// the vendored Reacts are loaded from their original source in the edge runtime
if (process.env.NEXT_RUNTIME !== 'edge') {
  vendoredReactRSC = require('./vendored/rsc/entrypoints')
  vendoredReactSSR = require('./vendored/ssr/entrypoints')
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
  fallbackRouteParams: FallbackRouteParams | null
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
      false,
      context.sharedContext
    )
  }

  public warmup(
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
      true,
      context.sharedContext
    )
  }
}

const vendored = {
  'react-rsc': vendoredReactRSC,
  'react-ssr': vendoredReactSSR,
  contexts: vendoredContexts,
}

export { renderToHTMLOrFlight, vendored }

export default AppPageRouteModule
