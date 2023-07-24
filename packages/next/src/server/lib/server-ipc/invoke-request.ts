import '../../node-polyfill-fetch'

import type { IncomingMessage } from 'http'
import type { Writable, Readable } from 'stream'
import { filterReqHeaders } from './utils'

export const invokeRequest = async (
  targetUrl: string,
  requestInit: {
    headers: IncomingMessage['headers']
    method: IncomingMessage['method']
  },
  readableBody?: Readable | ReadableStream
) => {
  const invokeHeaders = filterReqHeaders({
    'cache-control': '',
    ...requestInit.headers,
  }) as IncomingMessage['headers']

  const invokeRes = await fetch(targetUrl, {
    headers: invokeHeaders as any as Headers,
    method: requestInit.method,
    redirect: 'manual',

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

  return invokeRes
}

export async function pipeReadable(
  readable: ReadableStream,
  writable: Writable
) {
  const reader = readable.getReader()

  async function doRead() {
    const item = await reader.read()

    if (item?.value) {
      writable.write(Buffer.from(item?.value))

      if ('flush' in writable) {
        ;(writable as any).flush()
      }
    }

    if (!item?.done) {
      return doRead()
    }
  }
  await doRead()
  writable.end()
}
