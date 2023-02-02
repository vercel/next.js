import { FLIGHT_PARAMETERS } from '../../client/components/app-router-headers'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { AsyncLocalStorage } from 'async_hooks'
import type { PreviewData } from '../../../types'
import type { RequestStore } from '../../client/components/request-async-storage'
import {
  ReadonlyHeaders,
  ReadonlyRequestCookies,
  type RenderOpts,
} from '../app-render'
import { AsyncStorageWrapper } from './async-storage-wrapper'
import type { tryGetPreviewData } from '../api-utils/node'

function headersWithoutFlight(headers: IncomingHttpHeaders) {
  const newHeaders = { ...headers }
  for (const param of FLIGHT_PARAMETERS) {
    delete newHeaders[param.toString().toLowerCase()]
  }
  return newHeaders
}

export type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
  renderOpts?: RenderOpts
}

export class RequestAsyncStorageWrapper
  implements AsyncStorageWrapper<RequestStore, RequestContext>
{
  /**
   * Tries to get the preview data on the request for the given route. This
   * isn't enabled in the edge runtime yet.
   */
  private static readonly tryGetPreviewData: typeof tryGetPreviewData | null =
    process.env.NEXT_RUNTIME !== 'edge'
      ? require('../api-utils/node').tryGetPreviewData
      : null

  /**
   * Wrap the callback with the given store so it can access the underlying
   * store using hooks.
   *
   * @param storage underlying storage object returned by the module
   * @param context context to seed the store
   * @param callback function to call within the scope of the context
   * @returns the result returned by the callback
   */
  public wrap<Result>(
    storage: AsyncLocalStorage<RequestStore>,
    context: RequestContext,
    callback: () => Result
  ): Result {
    return RequestAsyncStorageWrapper.wrap(storage, context, callback)
  }

  /**
   * @deprecated instance method should be used in favor of the static method
   */
  public static wrap<Result>(
    storage: AsyncLocalStorage<RequestStore>,
    { req, res, renderOpts }: RequestContext,
    callback: () => Result
  ): Result {
    // Reads of this are cached on the `req` object, so this should resolve
    // instantly. There's no need to pass this data down from a previous
    // invoke, where we'd have to consider server & serverless.
    const previewData: PreviewData =
      renderOpts && RequestAsyncStorageWrapper.tryGetPreviewData
        ? // TODO: investigate why previewProps isn't on RenderOpts
          RequestAsyncStorageWrapper.tryGetPreviewData(
            req,
            res,
            (renderOpts as any).previewProps
          )
        : false

    let cachedHeadersInstance: ReadonlyHeaders
    let cachedCookiesInstance: ReadonlyRequestCookies

    const store: RequestStore = {
      get headers() {
        if (!cachedHeadersInstance) {
          cachedHeadersInstance = new ReadonlyHeaders(
            headersWithoutFlight(req.headers)
          )
        }
        return cachedHeadersInstance
      },
      get cookies() {
        if (!cachedCookiesInstance) {
          cachedCookiesInstance = new ReadonlyRequestCookies({
            headers: {
              get: (key) => {
                if (key !== 'cookie') {
                  throw new Error('Only cookie header is supported')
                }
                return req.headers.cookie
              },
            },
          })
        }
        return cachedCookiesInstance
      },
      previewData,
    }

    return storage.run(store, callback)
  }
}
