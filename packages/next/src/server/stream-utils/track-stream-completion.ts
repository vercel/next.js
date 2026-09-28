import type { Readable } from 'node:stream'
import type { AnyStream } from '../app-render/app-render-prerender-utils'

function trackWebStreamCompletion(
  stream: ReadableStream<Uint8Array>,
  onSettled: (completed: boolean) => void
): ReadableStream<Uint8Array> {
  if (stream.locked) return stream

  const bridge = new TransformStream<Uint8Array, Uint8Array>()
  const notify = (completed: boolean) => {
    try {
      onSettled(completed)
    } catch {
      // Observers must not change response delivery.
    }
  }
  void stream.pipeTo(bridge.writable).then(
    () => notify(true),
    () => notify(false)
  )
  return bridge.readable
}

/** Observe a stream's readable completion without waiting for response work. */
export function trackStreamCompletion(
  stream: ReadableStream<Uint8Array>,
  onSettled: (completed: boolean) => void
): ReadableStream<Uint8Array>
export function trackStreamCompletion(
  stream: Readable,
  onSettled: (completed: boolean) => void
): Readable
export function trackStreamCompletion(
  stream: AnyStream,
  onSettled: (completed: boolean) => void
): AnyStream
export function trackStreamCompletion(
  stream: AnyStream,
  onSettled: (completed: boolean) => void
): AnyStream {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    if (stream instanceof ReadableStream) {
      return trackWebStreamCompletion(stream, onSettled)
    } else {
      return (
        require('./track-stream-completion.node') as typeof import('./track-stream-completion.node')
      ).trackStreamCompletion(stream, onSettled)
    }
  } else {
    return trackWebStreamCompletion(
      stream as ReadableStream<Uint8Array>,
      onSettled
    )
  }
}
