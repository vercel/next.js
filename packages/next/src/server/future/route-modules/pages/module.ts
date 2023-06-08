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
import type { NextRequest } from '../../../web/spec-extension/request'

import {
  RouteModule,
  type RouteModuleHandleContext,
  type RouteModuleOptions,
} from '../route-module'
import { renderToHTML } from '../../../render'
import { renderResultToResponse } from '../helpers/render-result-to-response'
import { MockedResponse } from '../../../lib/mock-request'

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
   * The incoming request from Node.js.
   */
  req: IncomingMessage

  /**
   * The outgoing response from Node.js.
   */
  res: ServerResponse

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

  /**
   * True if the `X-Powered-By` header should be sent with the response.
   */
  poweredByHeader: boolean

  /**
   * True if the `ETag` header should be sent with the response.
   */
  generateEtags: boolean
}

export type PagesRouteModuleOptions = RouteModuleOptions<
  PagesRouteDefinition,
  PagesUserlandModule
>

export class PagesRouteModule extends RouteModule<
  PagesRouteDefinition,
  PagesUserlandModule
> {
  public async handle(
    request: NextRequest,
    context: PagesRouteHandlerContext
  ): Promise<Response> {
    // The mocked response here will act as a buffer for the response sent by
    // the userland code. This will allow us to inspect it and convert it to a
    // response that can be sent to the client.
    const res = new MockedResponse(context.res)

    // Perform the underlying render of the HTML.
    const result = await this.render(
      context.req,
      res,
      context.page,
      context.query,
      context.renderOpts
    )

    // Add any fetch tags that were on the page to the response headers.
    const cacheTags = (context.renderOpts as any).fetchTags
    if (cacheTags) {
      res.setHeader('x-next-cache-tags', cacheTags)
    }

    // Convert the render result to a response that can be sent to the client.
    return renderResultToResponse(
      request,
      result,
      {
        hasGetStaticProps: typeof this.userland.getStaticProps === 'function',
        definition: this.definition,
        basePath: context.renderOpts.basePath,
        poweredByHeader: context.poweredByHeader,
        generateEtags: context.generateEtags,
      },
      {
        res,
        isDataReq: context.renderOpts.isDataReq,
        isPreviewMode: context.renderOpts.isDraftMode === true,
      }
    )
  }

  public async render(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult> {
    const result = await renderToHTML(req, res, pathname, query, renderOpts)

    return result
  }
}

export default PagesRouteModule
