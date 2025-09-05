export interface BatchingOptions {
  readonly idleFlushDelayMs?: number
  readonly idleImmediateMs?: number
  readonly maxBatchAgeMs?: number
  readonly maxBatchSizeBytes?: number
}

export function createBatchingTransformStream(options: BatchingOptions = {}) {
  const {
    idleFlushDelayMs = 6,
    idleImmediateMs = 100,
    maxBatchAgeMs = 12,
    maxBatchSizeBytes = 128 * 1024,
  } = options

  let queuedChunks: Uint8Array[] = []
  let queuedBytes = 0
  let idleFlushTimer: NodeJS.Timeout | null = null
  let maxBatchAgeTimer: NodeJS.Timeout | null = null
  let lastFlushAt = performance.now()

  const flush = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!queuedBytes) {
      return
    }

    idleFlushTimer = clearTimer(idleFlushTimer)
    maxBatchAgeTimer = clearTimer(maxBatchAgeTimer)

    const chunk = concatenateChunks(queuedChunks, queuedBytes)

    queuedChunks = []
    queuedBytes = 0
    lastFlushAt = performance.now()

    controller.enqueue(chunk)
  }

  const scheduleFlush = (
    controller: TransformStreamDefaultController<Uint8Array>
  ) => {
    idleFlushTimer = clearTimer(idleFlushTimer)
    idleFlushTimer = setTimeout(() => flush(controller), idleFlushDelayMs)

    if (!maxBatchAgeTimer) {
      maxBatchAgeTimer = setTimeout(() => flush(controller), maxBatchAgeMs)
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const now = performance.now()

      // After an idle period, send the first arriving chunk immediately.
      if (queuedBytes === 0 && now - lastFlushAt >= idleImmediateMs) {
        controller.enqueue(chunk)
        lastFlushAt = now
        return
      }

      // Otherwise queue the chunk to be flushed in a batch.
      queuedChunks.push(chunk)
      queuedBytes += chunk.byteLength

      if (queuedBytes >= maxBatchSizeBytes) {
        flush(controller)
      } else {
        scheduleFlush(controller)
      }
    },
    flush,
  })
}

function concatenateChunks(
  chunks: Uint8Array[],
  totalBytes: number
): Uint8Array {
  const concatenatedChunk = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    concatenatedChunk.set(chunk, offset)
    offset += chunk.byteLength
  }

  return concatenatedChunk
}

function clearTimer(timer: NodeJS.Timeout | null) {
  if (timer) {
    clearTimeout(timer)
  }

  return null
}
