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
import { ResponseCookies, RequestCookies } from '../web/spec-extension/cookies'
import { DraftModeProvider } from './draft-mode-provider'
import { splitCookiesString } from '../web/utils'

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

export type RequestContext = {
  req: IncomingMessage | BaseNextRequest | NextRequest
  res?: ServerResponse | BaseNextResponse
  renderOpts?: RenderOpts
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
    }

    return storage.run(store, callback, store)
  },
}
