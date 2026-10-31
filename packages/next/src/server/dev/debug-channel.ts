import type { Readable } from 'node:stream'
import { createBufferedTransformStream } from '../stream-utils/node-web-streams-helper'
import { createNodeBufferedTransformStream } from '../stream-utils/node-buffered-transform-stream'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'
import type { AnyStream } from '../app-render/stream-ops'

// Chunks are sent to the browser in batches to reduce overhead, flushing
// synchronously once this many bytes have accumulated.
const MAX_DEBUG_CHANNEL_BATCH_BYTES = 128 * 1024

export interface ReactDebugChannelForBrowser {
  readonly readable: AnyStream
}

const reactDebugChannelsByHtmlRequestId = new Map<
  string,
  ReactDebugChannelForBrowser
>()

/**
 * Reads the React debug channel and forwards its chunks to the browser through
 * the websocket. Branches on the stream type so that Node streams stay
 * node-native — batched with a Node `Transform` and consumed via events.
 */
export function connectReactDebugChannel(
  requestId: string,
  debugChannel: ReactDebugChannelForBrowser,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  let finished = false

  const stop = () => {
    if (finished) {
      return
    }
    finished = true
    sendToClient({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
      requestId,
      chunk: null,
    })
  }

  const onError = (err: unknown) => {
    if (!finished) {
      console.error(
        new Error('React debug channel stream error', { cause: err })
      )
    }
    stop()
  }

  const sendChunk = (chunk: Uint8Array) => {
    sendToClient({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
      requestId,
      chunk,
    })
  }

  const { readable } = debugChannel

  if (readable instanceof ReadableStream) {
    const reader = readable
      .pipeThrough(
        createBufferedTransformStream({
          maxBufferByteLength: MAX_DEBUG_CHANNEL_BATCH_BYTES,
        })
      )
      .getReader()

    const progress = (entry: ReadableStreamReadResult<Uint8Array>) => {
      if (entry.done) {
        stop()
      } else {
        sendChunk(entry.value)
        reader.read().then(progress, onError)
      }
    }

    reader.read().then(progress, onError)
  } else {
    const source = readable as Readable
    // `pipe` does not forward source errors to the destination, so handle them
    // on the source directly.
    source.on('error', onError)
    const batched = source.pipe(
      createNodeBufferedTransformStream(MAX_DEBUG_CHANNEL_BATCH_BYTES)
    )
    batched.on('data', sendChunk)
    batched.on('end', stop)
    batched.on('error', onError)
  }
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
