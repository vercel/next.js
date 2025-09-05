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

const MAX_BATCH_BYTES = 64 * 1024
const IDLE_FLUSH_DELAY_MS = 6
const MAX_BATCH_AGE_MS = 12
const IDLE_IMMEDIATE_MS = 200

export function connectReactDebugChannel(
  requestId: string,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const debugChannel = reactDebugChannelsByRequestId.get(requestId)

  if (!debugChannel) {
    return
  }

  const reader = debugChannel.readable.getReader()

  let batchedChunks: Uint8Array[] = []
  let batchedBytes = 0
  let idleFlushTimer: NodeJS.Timeout | null = null
  let maxBatchAgeTimer: NodeJS.Timeout | null = null
  let lastFlushAt = performance.now()
  let stopped = false

  const sendChunk = (chunk: Uint8Array | null) => {
    sendToClient({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
      requestId,
      chunk,
    })
  }

  const flush = () => {
    if (batchedBytes === 0) {
      return
    }

    idleFlushTimer = clearTimer(idleFlushTimer)
    maxBatchAgeTimer = clearTimer(maxBatchAgeTimer)

    const chunk = concatChunks(batchedChunks, batchedBytes)

    batchedChunks = []
    batchedBytes = 0
    lastFlushAt = performance.now()

    sendChunk(chunk)
  }

  const scheduleFlush = () => {
    idleFlushTimer = clearTimer(idleFlushTimer)
    idleFlushTimer = setTimeout(flush, IDLE_FLUSH_DELAY_MS)

    if (maxBatchAgeTimer === null) {
      maxBatchAgeTimer = setTimeout(flush, MAX_BATCH_AGE_MS)
    }
  }

  const stop = () => {
    if (stopped) {
      return
    }

    stopped = true
    idleFlushTimer = clearTimer(idleFlushTimer)
    maxBatchAgeTimer = clearTimer(maxBatchAgeTimer)

    flush()
    sendChunk(null)

    reader.releaseLock()
    reactDebugChannelsByRequestId.delete(requestId)
  }

  const progress = (entry: ReadableStreamReadResult<Uint8Array>) => {
    if (stopped) {
      return
    }

    if (entry.done) {
      return stop()
    }

    const chunk = entry.value
    const now = performance.now()

    if (batchedBytes === 0 && now - lastFlushAt >= IDLE_IMMEDIATE_MS) {
      sendChunk(chunk)
      lastFlushAt = now
    } else {
      batchedChunks.push(chunk)
      batchedBytes += chunk.byteLength

      if (batchedBytes >= MAX_BATCH_BYTES) {
        flush()
      } else {
        scheduleFlush()
      }
    }

    reader.read().then(progress, stop)
  }

  reader.read().then(progress, stop)
}

export function setReactDebugChannel(
  requestId: string,
  debugChannel: ReactDebugChannelForBrowser
) {
  reactDebugChannelsByRequestId.set(requestId, debugChannel)
}

function clearTimer(timer: NodeJS.Timeout | null) {
  if (timer) {
    clearTimeout(timer)
  }

  return null
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}
