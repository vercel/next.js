import { bindSnapshot } from '../app-render/async-local-storage'

/** Consume a stream in the async context in which this adapter is created. */
export function bindReadableStream<T>(
  stream: ReadableStream<T>
): ReadableStream<T> {
  const reader = stream.getReader()
  let cancelled = false

  return new ReadableStream<T>(
    {
      pull: bindSnapshot(async (controller) => {
        try {
          const { done, value } = await reader.read()
          // Cancellation also settles an outstanding read. Its controller has
          // already closed, and cancel() will release the reader.
          if (cancelled) return

          if (done) {
            reader.releaseLock()
            controller.close()
          } else {
            controller.enqueue(value)
          }
        } catch (error) {
          reader.releaseLock()
          controller.error(error)
        }
      }),
      cancel: bindSnapshot(async (reason) => {
        cancelled = true
        try {
          await reader.cancel(reason)
        } finally {
          reader.releaseLock()
        }
      }),
    },
    // Do not start reading until the downstream consumer requests a chunk.
    { highWaterMark: 0 }
  )
}
