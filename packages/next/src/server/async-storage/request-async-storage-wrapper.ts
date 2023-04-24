import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestStore } from '../../client/components/request-async-storage'
import type { RenderOpts } from '../app-render/types'
import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { NextRequest } from '../web/spec-extension/request'

import { FLIGHT_PARAMETERS } from '../../client/components/app-router-headers'
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import {
  RequestCookiesAdapter,
  type ReadonlyRequestCookies,
} from '../web/spec-extension/adapters/request-cookies'
import { RequestCookies } from '../web/spec-extension/cookies'
import {
  checkIsOnDemandRevalidate,
  COOKIE_NAME_PRERENDER_BYPASS,
  __ApiPreviewProps,
} from '../api-utils'

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
    { req, renderOpts }: RequestContext,
    callback: (store: RequestStore) => Result
  ): Result {
    // TODO: investigate why previewProps isn't on RenderOpts
    const previewProps = (renderOpts as any).previewProps as
      | __ApiPreviewProps
      | undefined

    const cache: {
      headers?: ReadonlyHeaders
      cookies?: ReadonlyRequestCookies
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
          // Seal the cookies object that'll freeze out any methods that could
          // mutate the underlying data.
          cache.cookies = getCookies(req.headers)
        }

        return cache.cookies
      },
      get draftMode(): boolean {
        // The logic for draftMode() is very similar to tryGetPreviewData()
        // but Draft Mode does not have any data associated with it.
        if (
          previewProps &&
          checkIsOnDemandRevalidate(req, previewProps).isOnDemandRevalidate
        ) {
          return false
        }

        const cookieValue = this.cookies.get(
          COOKIE_NAME_PRERENDER_BYPASS
        )?.value
        return Boolean(
          cookieValue &&
            previewProps &&
            cookieValue === previewProps.previewModeId
        )
      },
    }

    return storage.run(store, callback, store)
  },
}
