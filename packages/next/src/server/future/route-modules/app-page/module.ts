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
import * as sharedModules from './shared-modules'

let vendoredReactRSC
let vendoredReactSSR
let vendoredReactShared

if (process.env.NEXT_RUNTIME !== 'edge') {
  vendoredReactRSC = require('./vendored/rsc/entrypoints')
  vendoredReactSSR = require('./vendored/ssr/entrypoints')
  vendoredReactShared = require('./vendored/shared/entrypoints')
}

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
  static readonly sharedModules = sharedModules
  // static readonly vendoredReact = vendoredReact
  // static readonly vendoredReactSSR = vendoredReactSSR

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
  'react-shared': vendoredReactShared,
}

export { renderToHTMLOrFlight, vendored }

export default AppPageRouteModule
