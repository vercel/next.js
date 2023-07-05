import type { IncomingMessage, ServerResponse } from 'http'
import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type RenderResult from '../../../render-result'
import type { RenderOpts } from '../../../app-render/types'
import type { NextParsedUrlQuery } from '../../../request-meta'
import type { LoaderTree } from '../../../lib/app-dir-module'

import { renderToHTMLOrFlightImpl } from '../../../app-render/app-render'
import {
  RouteModule,
  type RouteModuleOptions,
  type RouteModuleHandleContext,
} from '../route-module'

// These are imported weirdly like this because of the way that the bundling
// works. We need to import the built files from the dist directory, but we
// can't do that directly because we need types from the source files. So we
// import the types from the source files and then import the built files.
const entryBase =
  require('next/dist/server/app-render/entry-base') as typeof import('../../../app-render/entry-base')

type AppPageUserlandModule = {
  /**
   * The tree created in next-app-loader that holds component segments and modules
   */
  loaderTree: LoaderTree
}

interface AppPageRouteHandlerContext extends RouteModuleHandleContext {
  pathname: string
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
  public handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }

  public render(
    req: IncomingMessage,
    res: ServerResponse,
    context: AppPageRouteHandlerContext
  ): Promise<RenderResult> {
    return renderToHTMLOrFlightImpl(
      req,
      res,
      context.pathname,
      context.query,
      context.renderOpts,
      {
        loaderTree: this.userland.loaderTree,
        entryBase,
      }
    )
  }
}

export default AppPageRouteModule
