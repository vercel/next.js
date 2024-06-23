import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { RenderOpts } from '../app-render/types'
import type { WithStore } from './with-store'
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
import { ResponseCookies, RequestCookies } from '../web/spec-extension/cookies'
import { DraftModeProvider } from './draft-mode-provider'
import { splitCookiesString } from '../web/utils'
import { createAfterContext, type AfterContext } from '../after/after-context'
import type { RequestLifecycleOpts } from '../base-server'

function getHeaders(headers: Headers | IncomingHttpHeaders): ReadonlyHeaders {
  const cleaned = HeadersAdapter.from(headers)
  for (const param of FLIGHT_PARAMETERS) {
    cleaned.delete(param.toString().toLowerCase())
  }

  return HeadersAdapter.seal(cleaned)
}

function getMutableCookies(
  headers: Headers | IncomingHttpHeaders,
  onUpdateCookies?: (cookies: string[]) => void
): ResponseCookies {
  const cookies = new RequestCookies(HeadersAdapter.from(headers))
  return MutableRequestCookiesAdapter.wrap(cookies, onUpdateCookies)
}

export type WrapperRenderOpts = RequestLifecycleOpts &
  Partial<
    Pick<
      RenderOpts,
      | 'ComponentMod'
      | 'onUpdateCookies'
      | 'assetPrefix'
      | 'reactLoadableManifest'
    >
  > & {
    experimental: Pick<RenderOpts['experimental'], 'after'>
    previewProps?: __ApiPreviewProps
  }

export type RequestContext = {
  req: IncomingMessage | BaseNextRequest | NextRequest
  /**
   * The URL of the request. This only specifies the pathname and the search
   * part of the URL. This is only undefined when generating static paths (ie,
   * there is no request in progress, nor do we know one).
   */
  url: {
    /**
     * The pathname of the requested URL.
     */
    pathname: string

    /**
     * The search part of the requested URL. If the request did not provide a
     * search part, this will be an empty string.
     */
    search?: string
  }
  res?: ServerResponse | BaseNextResponse
  renderOpts?: WrapperRenderOpts
}

export const withRequestStore: WithStore<RequestStore, RequestContext> = <
  Result,
>(
  storage: AsyncLocalStorage<RequestStore>,
  { req, url, res, renderOpts }: RequestContext,
  callback: (store: RequestStore) => Result
): Result => {
  const [wrapWithAfter, afterContext] = createAfterWrapper(renderOpts)

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
    // Rather than just using the whole `url` here, we pull the parts we want
    // to ensure we don't use parts of the URL that we shouldn't. This also
    // lets us avoid requiring an empty string for `search` in the type.
    url: { pathname: url.pathname, search: url.search ?? '' },
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
        const requestCookies = new RequestCookies(
          HeadersAdapter.from(req.headers)
        )

        if (
          'x-middleware-set-cookie' in req.headers &&
          typeof req.headers['x-middleware-set-cookie'] === 'string'
        ) {
          const setCookieValue = req.headers['x-middleware-set-cookie']
          const responseHeaders = new Headers()

          for (const cookie of splitCookiesString(setCookieValue)) {
            responseHeaders.append('set-cookie', cookie)
          }

          const responseCookies = new ResponseCookies(responseHeaders)

          // Transfer cookies from ResponseCookies to RequestCookies
          for (const cookie of responseCookies.getAll()) {
            requestCookies.set(cookie.name, cookie.value ?? '')
          }
        }

        // Seal the cookies object that'll freeze out any methods that could
        // mutate the underlying data.
        cache.cookies = RequestCookiesAdapter.seal(requestCookies)
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
          renderOpts?.previewProps,
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
  return wrapWithAfter(store, () => storage.run(store, callback, store))
}

function createAfterWrapper(
  renderOpts: WrapperRenderOpts | undefined
): [
  wrap: <Result>(requestStore: RequestStore, callback: () => Result) => Result,
  afterContext: AfterContext | undefined,
] {
  const isAfterEnabled = renderOpts?.experimental?.after ?? false
  if (!renderOpts || !isAfterEnabled) {
    return [(_, callback) => callback(), undefined]
  }

  const { waitUntil, onClose } = renderOpts
  const cacheScope = renderOpts.ComponentMod?.createCacheScope()

  const afterContext = createAfterContext({
    waitUntil,
    onClose,
    cacheScope,
  })

  const wrap = <Result>(requestStore: RequestStore, callback: () => Result) =>
    afterContext.run(requestStore, callback)

  return [wrap, afterContext]
}
