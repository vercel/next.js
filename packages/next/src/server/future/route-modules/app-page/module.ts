import type { IncomingMessage, ServerResponse } from 'http'
import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type RenderResult from '../../../render-result'
import type { RenderOpts } from '../../../app-render/types'
import type { NextParsedUrlQuery } from '../../../request-meta'
import type { LoaderTree } from '../../../lib/app-dir-module'

import { renderToHTMLOrFlight } from '../../../app-render/app-render'
import {
  RouteModule,
  type RouteModuleOptions,
  type RouteModuleHandleContext,
} from '../route-module'
import * as vendoredContexts from './vendored/contexts/entrypoints'

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
export type AppPageModule =
  typeof import('../../../../build/templates/app-page')

type AppPageUserlandModule = {
  /**
   * The tree created in next-app-loader that holds component segments and modules
   */
  loaderTree: LoaderTree
}

interface AppPageRouteHandlerContext extends RouteModuleHandleContext {
  page: string
  query: NextParsedUrlQuery
  renderOpts: RenderOpts
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
    req: IncomingMessage,
    res: ServerResponse,
    context: AppPageRouteHandlerContext
  ): Promise<RenderResult> {
    return renderToHTMLOrFlight(
      req,
      res,
      context.page,
      context.query,
      context.renderOpts
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
