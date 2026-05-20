import type { Readable } from 'node:stream'
import { createBufferedTransformStream } from '../stream-utils/node-web-streams-helper'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'
import type { AnyStream } from '../app-render/stream-ops'

function toWebReadableStream(stream: AnyStream): ReadableStream<Uint8Array> {
  if (stream instanceof ReadableStream) {
    return stream
  }
  const { Readable: ReadableClass } =
    require('node:stream') as typeof import('node:stream')
  return ReadableClass.toWeb(stream as Readable) as ReadableStream<Uint8Array>
}

export interface ReactDebugChannelForBrowser {
  readonly readable: AnyStream
}

const reactDebugChannelsByHtmlRequestId = new Map<
  string,
  ReactDebugChannelForBrowser
>()

// Debug payloads over HMR are only used for React DevTools suspend metadata.
// Large server-only values (e.g. fs.readFile of big JSON) must not be forwarded
// in full or they can crash the browser renderer.
const REACT_DEBUG_CHANNEL_HMR_MAX_BYTES = 1024 * 1024

export function takeReactDebugChunkForHmr(
  chunk: Uint8Array,
  bytesSent: number,
  maxBytes: number = REACT_DEBUG_CHANNEL_HMR_MAX_BYTES
): {
  chunk: Uint8Array | null
  bytesSent: number
  done: boolean
} {
  if (bytesSent >= maxBytes) {
    return { chunk: null, bytesSent, done: true }
  }

  const remaining = maxBytes - bytesSent

  if (chunk.byteLength <= remaining) {
    const nextBytesSent = bytesSent + chunk.byteLength
    return {
      chunk,
      bytesSent: nextBytesSent,
      done: nextBytesSent >= maxBytes,
    }
  }

  return {
    chunk: chunk.subarray(0, remaining),
    bytesSent: maxBytes,
    done: true,
  }
}

export function connectReactDebugChannel(
  requestId: string,
  debugChannel: ReactDebugChannelForBrowser,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const reader = toWebReadableStream(debugChannel.readable)
    .pipeThrough(
      // We're sending the chunks in batches to reduce overhead in the browser.
      createBufferedTransformStream({ maxBufferByteLength: 128 * 1024 })
    )
    .getReader()

  let bytesSent = 0
  let finished = false

  const stop = () => {
    sendToClient({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
      requestId,
      chunk: null,
    })
  }

  const finish = (cancelReader: boolean) => {
    if (finished) {
      return
    }
    finished = true
    if (cancelReader) {
      reader.cancel().catch(() => {})
    }
    stop()
  }

  const onError = (err: unknown) => {
    console.error(new Error('React debug channel stream error', { cause: err }))
    finish(false)
  }

  const progress = (entry: ReadableStreamReadResult<Uint8Array>) => {
    if (finished) {
      return
    }

    if (entry.done) {
      finish(false)
      return
    }

    const {
      chunk,
      bytesSent: nextBytesSent,
      done,
    } = takeReactDebugChunkForHmr(entry.value, bytesSent)
    bytesSent = nextBytesSent

    if (chunk && chunk.byteLength > 0) {
      sendToClient({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
        requestId,
        chunk,
      })
    }

    if (done) {
      finish(true)
      return
    }

    reader.read().then(progress, onError)
  }

  reader.read().then(progress, onError)
}

export function connectReactDebugChannelForHtmlRequest(
  htmlRequestId: string,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const debugChannel = reactDebugChannelsByHtmlRequestId.get(htmlRequestId)

  if (!debugChannel) {
    return
  }

  reactDebugChannelsByHtmlRequestId.delete(htmlRequestId)

  connectReactDebugChannel(htmlRequestId, debugChannel, sendToClient)
}

export function setReactDebugChannelForHtmlRequest(
  htmlRequestId: string,
  debugChannel: ReactDebugChannelForBrowser
) {
  // TODO: Clean up after a timeout, in case the client never connects, e.g.
  // when CURL'ing the page, or loading the page with JavaScript disabled etc.
  reactDebugChannelsByHtmlRequestId.set(htmlRequestId, debugChannel)
}

export function deleteReactDebugChannelForHtmlRequest(htmlRequestId: string) {
  reactDebugChannelsByHtmlRequestId.delete(htmlRequestId)
}
