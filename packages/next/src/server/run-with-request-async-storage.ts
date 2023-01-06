import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { PreviewData } from 'next/types'
import { FLIGHT_PARAMETERS } from '../client/components/app-router-headers'
import type {
  RequestStore,
  RequestAsyncStorage,
} from '../client/components/request-async-storage'
import {
  ReadonlyHeaders,
  ReadonlyRequestCookies,
  type RenderOpts,
} from './app-render'

function headersWithoutFlight(headers: IncomingHttpHeaders) {
  const newHeaders = { ...headers }
  for (const param of FLIGHT_PARAMETERS) {
    delete newHeaders[param.toString().toLowerCase()]
  }
  return newHeaders
}

type RunWithRequestAsyncStorageContext = {
  req: IncomingMessage
  res: ServerResponse
  renderOpts?: RenderOpts
}

export function runWithRequestAsyncStorage<Result>(
  requestAsyncStorage: RequestAsyncStorage,
  { req, res, renderOpts }: RunWithRequestAsyncStorageContext,
  callback: () => Promise<Result>
): Promise<Result> {
  const tryGetPreviewData =
    process.env.NEXT_RUNTIME === 'edge'
      ? () => false
      : require('./api-utils/node').tryGetPreviewData

  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData: PreviewData = renderOpts
    ? // TODO: investigate why previewProps isn't on RenderOpts
      tryGetPreviewData(req, res, (renderOpts as any).previewProps)
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

  return requestAsyncStorage.run(store, callback)
}
