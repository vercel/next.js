import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders } from 'http'
import type { RequestStore } from '../app-render/work-unit-async-storage.external'
import type { RenderOpts } from '../app-render/types'
import type { NextRequest } from '../web/spec-extension/request'
import type { __ApiPreviewProps } from '../api-utils'

import {
  FLIGHT_HEADERS,
  NEXT_HTML_REQUEST_ID_HEADER,
  NEXT_REQUEST_ID_HEADER,
} from '../../client/components/app-router-headers'
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import {
  MutableRequestCookiesAdapter,
  RequestCookiesAdapter,
  responseCookiesToRequestCookies,
  createCookiesWithMutableAccessCheck,
  type ReadonlyRequestCookies,
} from '../web/spec-extension/adapters/request-cookies'
import { ResponseCookies, RequestCookies } from '../web/spec-extension/cookies'
import { DraftModeProvider } from './draft-mode-provider'
import { splitCookiesString } from '../web/utils'
import type { ServerComponentsHmrCache } from '../response-cache'
import type { ResumeDataCache } from '../resume-data-cache/resume-data-cache'
import type { Params } from '../request/params'
import type { ImplicitTags } from '../lib/implicit-tags'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'

function getHeaders(headers: Headers | IncomingHttpHeaders): ReadonlyHeaders {
  const cleaned = HeadersAdapter.from(headers)
  for (const header of FLIGHT_HEADERS) {
    cleaned.delete(header)
  }

  // The client sends these dev-only request IDs so the server can route debug
  // information back to the originating request. Like the flight headers, they
  // are internal plumbing and must not be exposed to userland `headers()`. The
  // server reads them from the raw request headers, not from here, so removing
  // them from this copy doesn't affect the debug channel for which they are
  // used.
  cleaned.delete(NEXT_REQUEST_ID_HEADER)
  cleaned.delete(NEXT_HTML_REQUEST_ID_HEADER)

  return HeadersAdapter.seal(cleaned)
}

function getMutableCookies(
  headers: Headers | IncomingHttpHeaders,
  onUpdateCookies?: (cookies: string[]) => void
): ResponseCookies {
  const cookies = new RequestCookies(HeadersAdapter.from(headers))
  return MutableRequestCookiesAdapter.wrap(cookies, onUpdateCookies)
}

export type WrapperRenderOpts = Partial<Pick<RenderOpts, 'onUpdateCookies'>> & {
  previewProps?: __ApiPreviewProps
}

type RequestContext = RequestResponsePair & {
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
  phase: RequestStore['phase']
  renderOpts?: WrapperRenderOpts
  isHmrRefresh?: boolean
  serverComponentsHmrCache?: ServerComponentsHmrCache
  implicitTags: ImplicitTags
}

type RequestResponsePair =
  | { req: BaseNextRequest; res: BaseNextResponse } // for an app page
  | { req: NextRequest; res: undefined } // in an api route or middleware

/**
 * The fields the request store actually reads from `req` / `res`. Decoupling
 * the store's construction from `IncomingMessage` / `BaseNextRequest` /
 * `NextRequest` lets it be built without a real `req`/`res` (e.g. by the `'use
 * cache'` deadlock probe worker, which only has a serializable snapshot of the
 * outer request).
 */
export type RequestStoreInputs = {
  phase: RequestStore['phase']
  /**
   * Raw headers, either as a Web `Headers` instance or Node's
   * `IncomingHttpHeaders`.
   */
  headers: Headers | IncomingHttpHeaders
  /**
   * Called whenever userspace mutates cookies (via `cookies().set(...)` etc.).
   * Real renders wire this to `res.setHeader('Set-Cookie', cookies)`. Pass
   * `undefined` for callers without a response (e.g. probe workers). Cookie
   * writes during `'render'` are still gated by
   * `MutableRequestCookiesAdapter`'s phase guard, so leaving this off doesn't
   * silently accept writes that would otherwise be rejected.
   */
  onUpdateCookies: ((cookies: string[]) => void) | undefined
  url: { pathname: string; search?: string }
  rootParams: Params
  implicitTags: ImplicitTags
  resumeDataCache: ResumeDataCache | null
  previewProps: WrapperRenderOpts['previewProps']
  isHmrRefresh: boolean | undefined
  serverComponentsHmrCache: ServerComponentsHmrCache | undefined
  fallbackParams: OpaqueFallbackRouteParams | null | undefined
}

/**
 * If middleware set cookies in this request (indicated by `x-middleware-set-cookie`),
 * then merge those into the existing cookie object, so that when `cookies()` is accessed
 * it's able to read the newly set cookies.
 */
function mergeMiddlewareCookies(
  headers: Headers | IncomingHttpHeaders,
  existingCookies: RequestCookies | ResponseCookies
) {
  // TODO: this only fires for `IncomingHttpHeaders`; `Headers` instances
  // silently fall through (the `in` check and bracket access don't reach header
  // values stored in internal slots). Confirm whether edge / Web `Headers`
  // callers need this merge or already handle it elsewhere.
  if (
    'x-middleware-set-cookie' in headers &&
    typeof headers['x-middleware-set-cookie'] === 'string'
  ) {
    const setCookieValue = headers['x-middleware-set-cookie']
    const responseHeaders = new Headers()

    for (const cookie of splitCookiesString(setCookieValue)) {
      responseHeaders.append('set-cookie', cookie)
    }

    const responseCookies = new ResponseCookies(responseHeaders)

    // Transfer cookies from ResponseCookies to RequestCookies
    for (const cookie of responseCookies.getAll()) {
      existingCookies.set(cookie)
    }
  }
}

export function createRequestStoreForRender(
  req: RequestContext['req'],
  res: RequestContext['res'],
  url: RequestContext['url'],
  rootParams: Params,
  implicitTags: RequestContext['implicitTags'],
  onUpdateCookies: RenderOpts['onUpdateCookies'],
  previewProps: WrapperRenderOpts['previewProps'],
  isHmrRefresh: RequestContext['isHmrRefresh'],
  serverComponentsHmrCache: RequestContext['serverComponentsHmrCache'],
  resumeDataCache: ResumeDataCache | null,
  fallbackParams: OpaqueFallbackRouteParams | null
): RequestStore {
  return createRequestStore({
    // Pages start in render phase by default
    phase: 'render',
    headers: req.headers,
    onUpdateCookies:
      onUpdateCookies ??
      (res
        ? (cookies: string[]) => {
            res.setHeader('Set-Cookie', cookies)
          }
        : undefined),
    url,
    rootParams,
    implicitTags,
    resumeDataCache,
    previewProps,
    isHmrRefresh,
    serverComponentsHmrCache,
    fallbackParams,
  })
}

export function createRequestStoreForAPI(
  req: RequestContext['req'],
  url: RequestContext['url'],
  implicitTags: RequestContext['implicitTags'],
  onUpdateCookies: RenderOpts['onUpdateCookies'],
  previewProps: WrapperRenderOpts['previewProps']
): RequestStore {
  return createRequestStore({
    // API routes start in action phase by default
    phase: 'action',
    headers: req.headers,
    onUpdateCookies,
    url,
    rootParams: {},
    implicitTags,
    resumeDataCache: null,
    previewProps,
    isHmrRefresh: false,
    serverComponentsHmrCache: undefined,
    fallbackParams: null,
  })
}

/**
 * Build a `RequestStore` from a serializable, request-shaped input. Used
 * directly by the existing `createRequestStoreForRender` /
 * `createRequestStoreForAPI` wrappers, and by side-process consumers like the
 * `'use cache'` deadlock probe worker that don't have a real `req`/`res` pair
 * but do have a forwarded snapshot of the outer request's headers etc.
 */
export function createRequestStore(inputs: RequestStoreInputs): RequestStore {
  const {
    phase,
    headers,
    onUpdateCookies,
    url,
    rootParams,
    implicitTags,
    resumeDataCache,
    previewProps,
    isHmrRefresh,
    serverComponentsHmrCache,
    fallbackParams,
  } = inputs

  const cache: {
    headers?: ReadonlyHeaders
    cookies?: ReadonlyRequestCookies
    mutableCookies?: ResponseCookies
    userspaceMutableCookies?: ResponseCookies
    draftMode?: DraftModeProvider
  } = {}

  return {
    type: 'request',
    phase,
    implicitTags,
    // Rather than just using the whole `url` here, we pull the parts we want
    // to ensure we don't use parts of the URL that we shouldn't. This also
    // lets us avoid requiring an empty string for `search` in the type.
    url: { pathname: url.pathname, search: url.search ?? '' },
    rootParams,
    get headers() {
      if (!cache.headers) {
        // Seal the headers object that'll freeze out any methods that could
        // mutate the underlying data.
        cache.headers = getHeaders(headers)
      }

      return cache.headers
    },
    get cookies() {
      if (!cache.cookies) {
        // if middleware is setting cookie(s), then include those in
        // the initial cached cookies so they can be read in render
        const requestCookies = new RequestCookies(HeadersAdapter.from(headers))

        mergeMiddlewareCookies(headers, requestCookies)

        // Seal the cookies object that'll freeze out any methods that could
        // mutate the underlying data.
        cache.cookies = RequestCookiesAdapter.seal(requestCookies)
      }

      return cache.cookies
    },
    set cookies(value: ReadonlyRequestCookies) {
      cache.cookies = value
    },
    get mutableCookies() {
      if (!cache.mutableCookies) {
        const mutableCookies = getMutableCookies(headers, onUpdateCookies)

        mergeMiddlewareCookies(headers, mutableCookies)

        cache.mutableCookies = mutableCookies
      }
      return cache.mutableCookies
    },
    get userspaceMutableCookies() {
      if (!cache.userspaceMutableCookies) {
        const userspaceMutableCookies =
          createCookiesWithMutableAccessCheck(this)
        cache.userspaceMutableCookies = userspaceMutableCookies
      }
      return cache.userspaceMutableCookies
    },
    get draftMode() {
      if (!cache.draftMode) {
        cache.draftMode = new DraftModeProvider(
          previewProps,
          headers,
          this.cookies,
          this.mutableCookies
        )
      }

      return cache.draftMode
    },
    resumeDataCache: resumeDataCache ?? null,
    isHmrRefresh,
    serverComponentsHmrCache:
      serverComponentsHmrCache ||
      (globalThis as any).__serverComponentsHmrCache,
    fallbackParams,
  }
}

export function synchronizeMutableCookies(store: RequestStore) {
  // TODO: does this need to update headers as well?
  store.cookies = RequestCookiesAdapter.seal(
    responseCookiesToRequestCookies(store.mutableCookies)
  )
}
