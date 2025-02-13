/** Monitor when the consumer finishes reading the response body.
that's as close as we can get to `res.on('close')` using web APIs.
*/
export function trackBodyConsumed(
  body: string | ReadableStream,
  onEnd: () => void
): BodyInit {
  if (typeof body === 'string') {
    const generator = async function* generate() {
      const encoder = new TextEncoder()
      yield encoder.encode(body)
      onEnd()
    }
    // @ts-expect-error BodyInit typings doesn't seem to include AsyncIterables even though it's supported in practice
    return generator()
  } else {
    return trackStreamConsumed(body, onEnd)
  }
}

export function trackStreamConsumed<TChunk>(
  stream: ReadableStream<TChunk>,
  onEnd: () => void
): ReadableStream<TChunk> {
  // NOTE:
  // This needs to be robust against the stream being cancelled.
  //
  // This can happen e.g. during redirects -- we'll stream a response,
  // but if we're not fast enough, the browser can disconnect before we finish
  // (because it wants to navigate to the redirect location anyway)
  // and we'll get cancelled with a `ResponseAborted`.
  //
  // Ideally, we would just do this:
  //
  //    const closePassThrough = new TransformStream<TChunk, TChunk>({
  //      flush() { onEnd() },
  //      cancel() { onEnd() },
  //    })
  //    return stream.pipeThrough(closePassThrough)
  //
  // But cancellation handling via `Transformer.cancel` is only available in node >20
  // so we can't use it yet, so we need to use a `ReadableStream` instead.

  let calledOnEnd = false
  return new ReadableStream<TChunk>({
    async start(controller) {
      const reader = stream.getReader()
      while (true) {
        try {
          const { done, value } = await reader.read()
          if (!done) {
            controller.enqueue(value)
          } else {
            controller.close()
            break
          }
        } catch (err) {
          controller.error(err)
          break
        }
      }
      if (!calledOnEnd) {
        calledOnEnd = true
        onEnd()
      }
    },
    cancel() {
      // NOTE: apparently `cancel()` can be called even after the reader above exits,
      // so we need to guard against calling the callback twice
      if (!calledOnEnd) {
        calledOnEnd = true
        onEnd()
      }
    },
  })
}

export class CloseController {
  private target = new EventTarget()
  listeners = 0
  isClosed = false

  onClose(callback: () => void) {
    if (this.isClosed) {
      throw new Error('Cannot subscribe to a closed CloseController')
    }

    this.target.addEventListener('close', callback)
    this.listeners++
  }

  dispatchClose() {
    if (this.isClosed) {
      throw new Error('Cannot close a CloseController multiple times')
    }
    if (this.listeners > 0) {
      this.target.dispatchEvent(new Event('close'))
    }
    this.isClosed = true
  }
}
