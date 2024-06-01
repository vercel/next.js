import type { NextRequest } from './spec-extension/request'
import type {
  AppRouteRouteHandlerContext,
  AppRouteRouteModule,
} from '../route-modules/app-route/module'
import type { PrerenderManifest } from '../../build'

import './globals'

import { adapter, type AdapterOptions } from './adapter'
import { IncrementalCache } from '../lib/incremental-cache'
import { RouteMatcher } from '../route-matchers/route-matcher'
import type { NextFetchEvent } from './spec-extension/fetch-event'
import { internal_getCurrentFunctionWaitUntil } from './internal-edge-wait-until'
import { getUtils } from '../server-utils'
import { searchParamsToUrlQuery } from '../../shared/lib/router/utils/querystring'
import type { RequestLifecycleOpts } from '../base-server'
import { CloseController, trackStreamConsumed } from './web-on-close'

type WrapOptions = Partial<Pick<AdapterOptions, 'page'>>

/**
 * EdgeRouteModuleWrapper is a wrapper around a route module.
 *
 * Note that this class should only be used in the edge runtime.
 */
export class EdgeRouteModuleWrapper {
  private readonly matcher: RouteMatcher

  /**
   * The constructor is wrapped with private to ensure that it can only be
   * constructed by the static wrap method.
   *
   * @param routeModule the route module to wrap
   */
  private constructor(private readonly routeModule: AppRouteRouteModule) {
    // TODO: (wyattjoh) possibly allow the module to define it's own matcher
    this.matcher = new RouteMatcher(routeModule.definition)
  }

  /**
   * This will wrap a module with the EdgeModuleWrapper and return a function
   * that can be used as a handler for the edge runtime.
   *
   * @param module the module to wrap
   * @param options any options that should be passed to the adapter and
   *                override the ones passed from the runtime
   * @returns a function that can be used as a handler for the edge runtime
   */
  public static wrap(
    routeModule: AppRouteRouteModule,
    options: WrapOptions = {}
  ) {
    // Create the module wrapper.
    const wrapper = new EdgeRouteModuleWrapper(routeModule)

    // Return the wrapping function.
    return (opts: AdapterOptions) => {
      return adapter({
        ...opts,
        ...options,
        IncrementalCache,
        // Bind the handler method to the wrapper so it still has context.
        handler: wrapper.handler.bind(wrapper),
      })
    }
  }

  private async handler(
    request: NextRequest,
    evt: NextFetchEvent
  ): Promise<Response> {
    const utils = getUtils({
      pageIsDynamic: this.matcher.isDynamic,
      page: this.matcher.definition.pathname,
      basePath: request.nextUrl.basePath,
      // We don't need the `handleRewrite` util, so can just pass an empty object
      rewrites: {},
      // only used for rewrites, so setting an arbitrary default value here
      caseSensitive: false,
    })

    const { params } = utils.normalizeDynamicRouteParams(
      searchParamsToUrlQuery(request.nextUrl.searchParams)
    )

    const prerenderManifest: PrerenderManifest | undefined =
      typeof self.__PRERENDER_MANIFEST === 'string'
        ? JSON.parse(self.__PRERENDER_MANIFEST)
        : undefined

    const isAfterEnabled = !!process.env.__NEXT_AFTER

    let waitUntil: RequestLifecycleOpts['waitUntil'] = undefined
    let closeController: CloseController | undefined

    if (isAfterEnabled) {
      waitUntil = evt.waitUntil.bind(evt)
      closeController = new CloseController()
    }

    // Create the context for the handler. This contains the params from the
    // match (if any).
    const context: AppRouteRouteHandlerContext = {
      params,
      prerenderManifest: {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        preview: prerenderManifest?.preview || {
          previewModeEncryptionKey: '',
          previewModeId: 'development-id',
          previewModeSigningKey: '',
        },
        notFoundRoutes: [],
      },
      renderOpts: {
        supportsDynamicResponse: true,
        waitUntil,
        onClose: closeController
          ? closeController.onClose.bind(closeController)
          : undefined,
        experimental: {
          after: isAfterEnabled,
        },
      },
    }

    // Get the response from the handler.
    let res = await this.routeModule.handle(request, context)

    const waitUntilPromises = [internal_getCurrentFunctionWaitUntil()]
    if (context.renderOpts.pendingWaitUntil) {
      waitUntilPromises.push(context.renderOpts.pendingWaitUntil)
    }
    evt.waitUntil(Promise.all(waitUntilPromises))

    if (closeController) {
      const _closeController = closeController // TS annoyance - "possibly undefined" in callbacks

      if (!res.body) {
        // we can delay running it until a bit later --
        // if it's needed, we'll have a `waitUntil` lock anyway.
        setTimeout(() => _closeController.dispatchClose(), 0)
      } else {
        // NOTE: if this is a streaming response, onClose may be called later,
        // so we can't rely on `closeController.listeners` -- it might be 0 at this point.
        const trackedBody = trackStreamConsumed(res.body, () =>
          _closeController.dispatchClose()
        )

        // make sure that NextRequestHint's awaiter stays open long enough
        // for `waitUntil`s called late during streaming to get picked up.
        evt.waitUntil(
          new Promise<void>((resolve) => _closeController.onClose(resolve))
        )

        res = new Response(trackedBody, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
      }
    }

    return res
  }
}
