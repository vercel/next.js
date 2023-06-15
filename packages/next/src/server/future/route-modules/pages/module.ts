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

import { RouteModule, type RouteModuleOptions } from '../route-module'
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

export type PagesRouteModuleOptions = RouteModuleOptions<
  PagesRouteDefinition,
  PagesUserlandModule
>

export class PagesRouteModule extends RouteModule<
  PagesRouteDefinition,
  PagesUserlandModule
> {
  public setup(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public handle(): Promise<Response> {
    throw new Error('Method not implemented.')
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
