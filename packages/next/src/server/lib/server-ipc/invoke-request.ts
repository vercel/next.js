import type { IncomingMessage } from 'http'
import type { Readable } from 'stream'
import { filterReqHeaders } from './utils'

export const invokeRequest = async (
  targetUrl: string,
  requestInit: {
    headers: IncomingMessage['headers']
    method: IncomingMessage['method']
    signal?: AbortSignal
  },
  readableBody?: Readable | ReadableStream
) => {
  // force to 127.0.0.1 as IPC always runs on this hostname
  // to avoid localhost issues
  const parsedTargetUrl = new URL(targetUrl)
  parsedTargetUrl.hostname = '127.0.0.1'

  const invokeHeaders = filterReqHeaders({
    'cache-control': '',
    ...requestInit.headers,
  }) as IncomingMessage['headers']

  return await fetch(parsedTargetUrl.toString(), {
    headers: invokeHeaders as any as Headers,
    method: requestInit.method,
    redirect: 'manual',
    signal: requestInit.signal,

    ...(requestInit.method !== 'GET' &&
    requestInit.method !== 'HEAD' &&
    readableBody
      ? {
          body: readableBody as BodyInit,
          duplex: 'half',
        }
      : {}),

    next: {
      // @ts-ignore
      internal: true,
    },
  })
}
