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
  // Track when the stream is fully consumed by monitoring the actual reads
  // from the destination stream, not just when the source finishes piping.
  let ended = false
  const runOnEnd = () => {
    if (!ended) {
      ended = true
      onEnd()
    }
  }

  const dest = new TransformStream({
    flush() {
      // Called when the stream is cleanly closed after all chunks are transformed
      runOnEnd()
    },
  })

  // Also handle cancellations/errors during piping
  stream.pipeTo(dest.writable).then(runOnEnd, runOnEnd)

  return dest.readable
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
