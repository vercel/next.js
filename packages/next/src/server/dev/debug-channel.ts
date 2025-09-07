import { createBufferedTransformStream } from '../stream-utils/node-web-streams-helper'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'

export interface ReactDebugChannelForBrowser {
  readonly readable: ReadableStream<Uint8Array>
  // Might also get a writable stream as return channel in the future.
}

const reactDebugChannelsByRequestId = new Map<
  string,
  ReactDebugChannelForBrowser
>()

export function connectReactDebugChannel(
  requestId: string,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const debugChannel = reactDebugChannelsByRequestId.get(requestId)

  if (!debugChannel) {
    return
  }

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

    reactDebugChannelsByRequestId.delete(requestId)
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

export function setReactDebugChannel(
  requestId: string,
  debugChannel: ReactDebugChannelForBrowser
) {
  reactDebugChannelsByRequestId.set(requestId, debugChannel)
}

export function deleteReactDebugChannel(requestId: string) {
  reactDebugChannelsByRequestId.delete(requestId)
}
