import type { IncomingMessage, ServerResponse } from 'http'
import type {
  GetServerSideProps,
  GetStaticPaths,
  GetStaticProps,
  NextComponentType,
  PageConfig,
} from '../../../../../types'
import type { PagesRouteDefinition } from '../../route-definitions/pages-route-definition'
import type { NextParsedUrlQuery } from '../../../request-meta'
import type { RenderOpts } from '../../../render'
import type RenderResult from '../../../render-result'

import {
  RouteModule,
  type RouteModuleHandleContext,
  type RouteModuleOptions,
} from '../route-module'
import { renderToHTML } from '../../../render'

/**
 * The userland module for a page. This is the module that is exported from the
 * page file that contains the page component, page config, and any page data
 * fetching functions.
 */
export type PagesUserlandModule = {
  /**
   * The exported page component.
   */
  readonly default: NextComponentType

  /**
   * The exported page config.
   */
  readonly config?: PageConfig

  /**
   * The exported `getStaticProps` function.
   */
  readonly getStaticProps?: GetStaticProps

  /**
   * The exported `getStaticPaths` function.
   */
  readonly getStaticPaths?: GetStaticPaths

  /**
   * The exported `getServerSideProps` function.
   */
  readonly getServerSideProps?: GetServerSideProps
}

/**
 * AppRouteRouteHandlerContext is the context that is passed to the route
 * handler for app routes.
 */
export interface PagesRouteHandlerContext extends RouteModuleHandleContext {
  /**
   * The page for the given route.
   */
  page: string

  /**
   * The parsed URL query for the given request.
   */
  query: NextParsedUrlQuery

  /**
   * The RenderOpts for the given request which include the specific modules to
   * use for rendering.
   */
  // TODO: (wyattjoh) break this out into smaller parts, it currently includes the userland components
  renderOpts: RenderOpts
}

export type PagesRouteModuleOptions = RouteModuleOptions<
  PagesRouteDefinition,
  PagesUserlandModule
>

export class PagesRouteModule extends RouteModule<
  PagesRouteDefinition,
  PagesUserlandModule
> {
  public handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }

  public render(
    req: IncomingMessage,
    res: ServerResponse,
    context: PagesRouteHandlerContext
  ): Promise<RenderResult> {
    return renderToHTML(
      req,
      res,
      context.page,
      context.query,
      context.renderOpts
    )
  }
}

export default PagesRouteModule
