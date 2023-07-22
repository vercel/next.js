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

export interface PipeTarget {
  write: (chunk: Uint8Array) => unknown
  end: () => unknown
  flush?: () => unknown
  destroy: (err?: Error) => unknown

  // These are necessary for us to detect client disconnect and cancel streaming.
  on: (event: 'close', cb: () => void) => void
  off: (event: 'close', cb: () => void) => void
  get destroyed(): boolean
}

export async function pipeReadable(
  readable: ReadableStream,
  writable: PipeTarget
) {
  const reader = readable.getReader()
  let readerDone = false

  function onClose() {
    writable.off?.('close', onClose)
    if (!readerDone) {
      readerDone = true
      reader.cancel().catch(() => {})
    }
  }
  writable.on?.('close', onClose)

  const id = String(Math.random()).slice(2, 5)
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
  } catch (e) {
    // Only the reader will throw an error, and if it does then we know that it is done.
    readerDone = true
    // If the client disconnects, we don't want to emit an unhandled error.
    if (!isAbortError(e)) {
      throw e
    }
  } finally {
    if (!writable.destroyed) {
      writable.end()
    }
    if (!readerDone) {
      reader.cancel().catch(() => {})
    }
    writable.off?.('close', onClose)
  }
}

export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError'
}
