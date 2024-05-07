import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { RenderOpts } from '../app-render/types'
import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { NextRequest } from '../web/spec-extension/request'
import type { __ApiPreviewProps } from '../api-utils'

import { FLIGHT_PARAMETERS } from '../../client/components/app-router-headers'
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import {
  MutableRequestCookiesAdapter,
  RequestCookiesAdapter,
  type ReadonlyRequestCookies,
} from '../web/spec-extension/adapters/request-cookies'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import { RequestCookies } from '../web/spec-extension/cookies'
import { DraftModeProvider } from './draft-mode-provider'
import {
  createAfterContext,
  createDisabledAfterContext,
  type AfterContext,
} from '../after'
import type { RequestLifecycleOpts } from '../base-server'

function getHeaders(headers: Headers | IncomingHttpHeaders): ReadonlyHeaders {
  const cleaned = HeadersAdapter.from(headers)
  for (const param of FLIGHT_PARAMETERS) {
    cleaned.delete(param.toString().toLowerCase())
  }

  return HeadersAdapter.seal(cleaned)
}

function getCookies(
  headers: Headers | IncomingHttpHeaders
): ReadonlyRequestCookies {
  const cookies = new RequestCookies(HeadersAdapter.from(headers))
  return RequestCookiesAdapter.seal(cookies)
}

function getMutableCookies(
  headers: Headers | IncomingHttpHeaders,
  onUpdateCookies?: (cookies: string[]) => void
): ResponseCookies {
  const cookies = new RequestCookies(HeadersAdapter.from(headers))
  return MutableRequestCookiesAdapter.wrap(cookies, onUpdateCookies)
}

type WrapperRenderOpts = RenderOpts &
  Partial<RequestLifecycleOpts> &
  RenderOptsForRouteHandlerPartial &
  RenderOptsForWebServerPartial

type RenderOptsForRouteHandlerPartial = Partial<
  Pick<
    RenderOpts,
    'ComponentMod' // undefined in a route handler
  >
>

type RenderOptsForWebServerPartial = {
  experimental?: Partial<Pick<RenderOpts['experimental'], 'after'>> // can be undefined in middleware
}

export type RequestContext = {
  req: IncomingMessage | BaseNextRequest | NextRequest
  res?: ServerResponse | BaseNextResponse
  renderOpts?: WrapperRenderOpts
}

export const RequestAsyncStorageWrapper: AsyncStorageWrapper<
  RequestStore,
  RequestContext
> = {
  /**
   * Wrap the callback with the given store so it can access the underlying
   * store using hooks.
   *
   * @param storage underlying storage object returned by the module
   * @param context context to seed the store
   * @param callback function to call within the scope of the context
   * @returns the result returned by the callback
   */
  wrap<Result>(
    storage: AsyncLocalStorage<RequestStore>,
    { req, res, renderOpts }: RequestContext,
    callback: (store: RequestStore) => Result
  ): Result {
    let previewProps: __ApiPreviewProps | undefined = undefined

    if (renderOpts && 'previewProps' in renderOpts) {
      // TODO: investigate why previewProps isn't on RenderOpts
      previewProps = (renderOpts as any).previewProps
    }

    const [_callback, afterContext] = wrapCallbackForAfter(renderOpts, callback)
    callback = _callback

    function defaultOnUpdateCookies(cookies: string[]) {
      if (res) {
        res.setHeader('Set-Cookie', cookies)
      }
    }

    const cache: {
      headers?: ReadonlyHeaders
      cookies?: ReadonlyRequestCookies
      mutableCookies?: ResponseCookies
      draftMode?: DraftModeProvider
    } = {}

    const store: RequestStore = {
      get headers() {
        if (!cache.headers) {
          // Seal the headers object that'll freeze out any methods that could
          // mutate the underlying data.
          cache.headers = getHeaders(req.headers)
        }

        return cache.headers
      },
      get cookies() {
        if (!cache.cookies) {
          // if middleware is setting cookie(s), then include those in
          // the initial cached cookies so they can be read in render
          let combinedCookies
          if (
            'x-middleware-set-cookie' in req.headers &&
            typeof req.headers['x-middleware-set-cookie'] === 'string'
          ) {
            combinedCookies = `${req.headers.cookie}; ${req.headers['x-middleware-set-cookie']}`
          }

          // Seal the cookies object that'll freeze out any methods that could
          // mutate the underlying data.
          cache.cookies = getCookies(
            combinedCookies
              ? {
                  ...req.headers,
                  cookie: combinedCookies,
                }
              : req.headers
          )
        }

        return cache.cookies
      },
      get mutableCookies() {
        if (!cache.mutableCookies) {
          cache.mutableCookies = getMutableCookies(
            req.headers,
            renderOpts?.onUpdateCookies ||
              (res ? defaultOnUpdateCookies : undefined)
          )
        }
        return cache.mutableCookies
      },
      get draftMode() {
        if (!cache.draftMode) {
          cache.draftMode = new DraftModeProvider(
            previewProps,
            req,
            this.cookies,
            this.mutableCookies
          )
        }

        return cache.draftMode
      },

      reactLoadableManifest: renderOpts?.reactLoadableManifest || {},
      assetPrefix: renderOpts?.assetPrefix || '',
      afterContext,
    }
    return storage.run(store, callback, store)
  },
}

function wrapCallbackForAfter<Result>(
  renderOpts: WrapperRenderOpts | undefined,
  callback: (store: RequestStore) => Result
): [typeof callback, AfterContext] {
  const isAfterEnabled = renderOpts?.experimental?.after
  if (!(renderOpts && isAfterEnabled)) {
    const afterContext = createDisabledAfterContext()
    return [callback, afterContext]
  }

  const waitUntil =
    renderOpts.waitUntil ??
    function missingWaitUntil() {
      // Error lazily, only when after() is actually called.
      throw new Error('Invariant: missing waitUntil implementation')
    }

  const onClose =
    renderOpts.onClose ??
    function missingOnClose() {
      // Error lazily, only when after() is actually called.
      throw new Error('Invariant: missing onClose implementation')
    }

  const cacheScope = renderOpts.ComponentMod?.createCacheScope()

  const afterContext = createAfterContext({ waitUntil, onClose, cacheScope })

  const wrappedCallback: typeof callback = (requestStore) =>
    afterContext.run(requestStore, () => callback(requestStore)) as Result // TODO(after): check if non-promise cases can happen here

  return [wrappedCallback, afterContext]
}
