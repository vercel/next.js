import type { Readable } from 'node:stream'

/** Observe readable EOF, error, or premature close without changing the stream. */
export function trackStreamCompletion(
  stream: Readable,
  onSettled: (completed: boolean) => void
): Readable {
  const notify = (completed: boolean) => {
    stream.off('end', onEnd)
    stream.off('error', onError)
    stream.off('close', onClose)
    try {
      onSettled(completed)
    } catch {
      // Observers must not change response delivery.
    }
  }
  const onEnd = () => notify(true)
  const onError = () => notify(false)
  const onClose = () => notify(false)

  if (stream.readableEnded || stream.destroyed) {
    notify(stream.readableEnded)
  } else {
    stream.once('end', onEnd)
    stream.once('error', onError)
    stream.once('close', onClose)
  }
  return stream
}
