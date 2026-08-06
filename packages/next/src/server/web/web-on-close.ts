export type ResponseBodyConsumption =
  | { outcome: 'finished' }
  | { outcome: 'aborted'; error?: unknown }
  | { outcome: 'errored'; error: unknown }

/**
 * Monitor how the consumer finishes reading the response body. This is as
 * close as we can get to `res.on('close')` using web APIs.
 */
export function trackBodyConsumed(
  body: string | ReadableStream,
  onEnd: (result: ResponseBodyConsumption) => void
): BodyInit {
  if (typeof body === 'string') {
    const encodedBody = new TextEncoder().encode(body)
    return trackStreamConsumed(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encodedBody)
          controller.close()
        },
      }),
      onEnd
    )
  } else {
    return trackStreamConsumed(body, onEnd)
  }
}

export function trackStreamConsumed<TChunk>(
  stream: ReadableStream<TChunk>,
  onEnd: (result: ResponseBodyConsumption) => void
): ReadableStream<TChunk> {
  const reader = stream.getReader()
  let completed = false

  const complete = (result: ResponseBodyConsumption) => {
    if (completed) {
      return
    }
    completed = true
    onEnd(result)
  }

  return new ReadableStream<TChunk>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          complete({ outcome: 'finished' })
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        controller.error(error)
        complete({ outcome: 'errored', error })
      }
    },
    async cancel(error) {
      complete({ outcome: 'aborted', error })
      await reader.cancel(error)
    },
  })
}

export class CloseController {
  private callbacks = new Set<(result: ResponseBodyConsumption) => void>()
  listeners = 0
  isClosed = false

  onClose(callback: (result: ResponseBodyConsumption) => void) {
    if (this.isClosed) {
      throw new Error('Cannot subscribe to a closed CloseController')
    }

    this.callbacks.add(callback)
    this.listeners++
  }

  dispatchClose(result: ResponseBodyConsumption = { outcome: 'finished' }) {
    if (this.isClosed) {
      throw new Error('Cannot close a CloseController multiple times')
    }

    this.isClosed = true
    const callbacks = Array.from(this.callbacks)
    this.callbacks.clear()
    this.listeners = 0
    for (const callback of callbacks) {
      try {
        callback(result)
      } catch (error) {
        // Match EventTarget dispatch: one listener must not block the others or
        // turn successful body consumption into a stream error.
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }
}
