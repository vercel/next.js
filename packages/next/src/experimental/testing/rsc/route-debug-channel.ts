import { Readable } from 'node:stream'
import type { RenderOpts } from '../../../server/app-render/types'
import { RenderRequestCleanupError } from './render-request'

type CapturedDebugChannel = {
  readonly htmlRequestId: string
  readonly requestId: string
  readonly chunks: Buffer[]
}

/** The real AppPage debug bytes belong to this request, not its main response. */
export function createRouteDebugChannelCollector() {
  const captured: CapturedDebugChannel[] = []
  const reads: Promise<void>[] = []
  let closing: Promise<void> | undefined

  const setReactDebugChannel: NonNullable<
    RenderOpts['setReactDebugChannel']
  > = ({ readable }, htmlRequestId, requestId) => {
    if (closing) throw new Error('The route debug channel owner has closed.')
    const channel: CapturedDebugChannel = {
      htmlRequestId,
      requestId,
      chunks: [],
    }
    const reader =
      readable instanceof Readable ? undefined : readable.getReader()
    captured.push(channel)
    const readComplete = (async () => {
      try {
        if (readable instanceof Readable) {
          for await (const chunk of readable) {
            channel.chunks.push(Buffer.from(chunk))
          }
        } else {
          for (;;) {
            const { done, value } = await reader!.read()
            if (done) break
            channel.chunks.push(Buffer.from(value))
          }
        }
      } finally {
        reader?.releaseLock()
      }
    })()
    reads.push(readComplete)
    // Preserve the actual rejection for close without an unhandled interval.
    void readComplete.catch(() => {})
  }

  return {
    setReactDebugChannel,
    /** Raw copied bytes and actual request IDs, retained for this owner's life. */
    captured: captured as readonly CapturedDebugChannel[],
    close(): Promise<void> {
      return (closing ??= Promise.resolve().then(async () => {
        const errors: unknown[] = []
        // React can still flush debug chunks after aborting the main response.
        // Its producer owns this stream; join its EOF/error without destroying it.
        for (const result of await Promise.allSettled(reads)) {
          if (result.status === 'rejected') errors.push(result.reason)
        }
        const unique = [...new Set(errors)]
        if (unique.length === 1) throw unique[0]
        if (unique.length > 1) throw new RenderRequestCleanupError(unique)
      }))
    },
  }
}
