import '../../node-polyfill-fetch'

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

  const invokeRes = await fetch(parsedTargetUrl.toString(), {
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

  return invokeRes
}

export interface PipeTarget {
  write: (chunk: Uint8Array) => unknown
  end: () => unknown
  flush?: () => unknown
  destroy: (err?: Error) => unknown
  get destroyed(): boolean
}

export async function pipeReadable(
  readable: ReadableStream,
  writable: PipeTarget
) {
  const reader = readable.getReader()
  let readerDone = false

  try {
    while (true) {
      const { done, value } = await reader.read()

      readerDone = done
      if (done || writable.destroyed) {
        break
      }

      if (value) {
        writable.write(Buffer.from(value))
        writable.flush?.()
      }
    }
  } finally {
    if (!writable.destroyed) {
      writable.end()
    }
    if (!readerDone) {
      reader.cancel().catch(() => {
        // If reading from the reader threw an error, cancelling will throw
        // another. Just swallow it.
      })
    }
  }
}
