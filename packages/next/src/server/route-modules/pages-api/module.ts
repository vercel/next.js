import type { IncomingMessage, ServerResponse } from 'http'
import type { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'
import type { PageConfig } from '../../../types'
import type { ParsedUrlQuery } from 'querystring'
import { wrapApiHandler, type __ApiPreviewProps } from '../../api-utils'
import type { RouteModuleOptions } from '../route-module'

import { RouteModule, type RouteModuleHandleContext } from '../route-module'
import { apiResolver } from '../../api-utils/node/api-resolver'
import type { RevalidateFn } from '../../lib/router-utils/router-server-context'

type PagesAPIHandleFn = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void>

/**
 * The PagesAPIModule is the type of the module exported by the bundled Pages
 * API module.
 */
export type PagesAPIModule = typeof import('../../../build/templates/pages-api')

type PagesAPIUserlandModule = {
  /**
   * The exported handler method.
   */
  readonly default: PagesAPIHandleFn

  /**
   * The exported page config.
   */
  readonly config?: PageConfig
}

type PagesAPIRouteHandlerContext = RouteModuleHandleContext & {
  /**
   * The incoming server request in non-edge runtime.
   */
  req?: IncomingMessage

  /**
   * The outgoing server response in non-edge runtime.
   */
  res?: ServerResponse

  /**
   * The hostname for the request.
   */
  hostname?: string

  /**
   * Keys allowed in the revalidate call.
   */
  allowedRevalidateHeaderKeys?: string[]

  /**
   * Whether to trust the host header.
   */
  trustHostHeader?: boolean

  /**
   * The query for the request.
   */
  query: ParsedUrlQuery

  /**
   * The preview props used by the `preview` API.
   */
  previewProps: __ApiPreviewProps

  /**
   * True if the server is in development mode.
   */
  dev: boolean

  /**
   * Whether errors should be left uncaught to handle
   * higher up
   */
  propagateError: boolean

  /**
   * The page that's being rendered.
   */
  page: string

  /**
   * The error handler for the request.
   */
  onError?: Parameters<typeof apiResolver>[8]

  /**
   * whether multi-zone flag is enabled for draft mode
   */
  multiZoneDraftMode?: boolean

  /**
   * Internal revalidate function to avoid revalidating
   * over the network
   */
  internalRevalidate?: RevalidateFn
}

export type PagesAPIRouteModuleOptions = RouteModuleOptions<
  PagesAPIRouteDefinition,
  PagesAPIUserlandModule
>

export class PagesAPIRouteModule extends RouteModule<
  PagesAPIRouteDefinition,
  PagesAPIUserlandModule
> {
  private apiResolverWrapped: typeof apiResolver

  constructor(options: PagesAPIRouteModuleOptions) {
    super(options)

    if (typeof options.userland.default !== 'function') {
      throw new Error(
        `Page ${options.definition.page} does not export a default function.`
      )
    }

    this.apiResolverWrapped = wrapApiHandler(
      options.definition.page,
      apiResolver
    )
  }

  /**
   *
   * @param req the incoming server request
   * @param res the outgoing server response
   * @param context the context for the render
   */
  public async render(
    req: IncomingMessage,
    res: ServerResponse,
    context: PagesAPIRouteHandlerContext
  ): Promise<void> {
    const { apiResolverWrapped } = this
    await apiResolverWrapped(
      req,
      res,
      context.query,
      this.userland,
      {
        ...context.previewProps,
        trustHostHeader: context.trustHostHeader,
        allowedRevalidateHeaderKeys: context.allowedRevalidateHeaderKeys,
        hostname: context.hostname,
        multiZoneDraftMode: context.multiZoneDraftMode,
        dev: context.dev,
        internalRevalidate: context.internalRevalidate,
      },
      context.propagateError,
      context.dev,
      context.page,
      context.onError
    )
  }
}

export default PagesAPIRouteModule
