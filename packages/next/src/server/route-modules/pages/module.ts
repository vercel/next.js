import type { IncomingMessage, ServerResponse } from 'http'
import type {
  GetServerSideProps,
  GetStaticPaths,
  GetStaticProps,
  NextComponentType,
  PageConfig,
} from '../../../types'
import type { PagesRouteDefinition } from '../../route-definitions/pages-route-definition'
import type { NextParsedUrlQuery } from '../../request-meta'
import type {
  PagesRenderContext,
  PagesSharedContext,
  RenderOpts,
} from '../../render'
import type RenderResult from '../../render-result'
import type { AppType, DocumentType } from '../../../shared/lib/utils'

import {
  RouteModule,
  type RouteModuleHandleContext,
  type RouteModuleOptions,
} from '../route-module'
import { renderToHTMLImpl, renderToHTML } from '../../render'
import * as vendoredContexts from './vendored/contexts/entrypoints'

/**
 * The PagesModule is the type of the module exported by the bundled pages
 * module.
 */
export type PagesModule = typeof import('../../../build/templates/pages')

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
 * The components that are used to render a page. These aren't tied to the
 * specific page being rendered, but rather are the components that are used to
 * render all pages.
 */
type PagesComponents = {
  /**
   * The `App` component. This could be exported by a user's custom `_app` page
   * file, or it could be the default `App` component.
   */
  readonly App: AppType

  /**
   * The `Document` component. This could be exported by a user's custom
   * `_document` page file, or it could be the default `Document` component.
   */
  readonly Document: DocumentType
}

export interface PagesRouteModuleOptions
  extends RouteModuleOptions<PagesRouteDefinition, PagesUserlandModule> {
  readonly components: PagesComponents
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
   * The shared context used for all page renders.
   */
  sharedContext: PagesSharedContext

  /**
   * The context for the given request.
   */
  renderContext: PagesRenderContext

  /**
   * The arguments for the given request.
  /**
   * The RenderOpts for the given request which include the specific modules to
   * use for rendering.
   */
  // TODO: (wyattjoh) break this out into smaller parts, it currently includes the userland components
  renderOpts: Omit<RenderOpts, 'Document' | 'App'>
}

export class PagesRouteModule extends RouteModule<
  PagesRouteDefinition,
  PagesUserlandModule
> {
  private readonly components: PagesComponents

  constructor(options: PagesRouteModuleOptions) {
    super(options)

    this.components = options.components
  }

  public render(
    req: IncomingMessage,
    res: ServerResponse,
    context: PagesRouteHandlerContext
  ): Promise<RenderResult> {
    return renderToHTMLImpl(
      req,
      res,
      context.page,
      context.query,
      context.renderOpts,
      {
        App: this.components.App,
        Document: this.components.Document,
      },
      context.sharedContext,
      context.renderContext
    )
  }
}

const vendored = {
  contexts: vendoredContexts,
}

// needed for the static build
export { renderToHTML, vendored }

export default PagesRouteModule
