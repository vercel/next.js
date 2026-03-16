import { createBufferedTransformStream } from '../stream-utils/node-web-streams-helper'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'

export interface ReactDebugChannelForBrowser {
  readonly readable: ReadableStream<Uint8Array>
  // Might also get a writable stream as return channel in the future.
}

const reactDebugChannelsByHtmlRequestId = new Map<
  string,
  ReactDebugChannelForBrowser
>()

export function connectReactDebugChannel(
  requestId: string,
  debugChannel: ReactDebugChannelForBrowser,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const reader = debugChannel.readable
    .pipeThrough(
      // We're sending the chunks in batches to reduce overhead in the browser.
      createBufferedTransformStream({ maxBufferByteLength: 128 * 1024 })
    )
    .getReader()

  const stop = () => {
    sendToClient({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
      requestId,
      chunk: null,
    })
  }

  const onError = (err: unknown) => {
    console.error(new Error('React debug channel stream error', { cause: err }))
    stop()
  }

  const progress = (entry: ReadableStreamReadResult<Uint8Array>) => {
    if (entry.done) {
      stop()
    } else {
      sendToClient({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
        requestId,
        chunk: entry.value,
      })

      reader.read().then(progress, onError)
    }
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
