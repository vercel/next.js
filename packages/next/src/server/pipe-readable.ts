export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError'
}

/**
 * This is a minimal implementation of a Writable with just enough
 * functionality to handle stream cancellation.
 */
export interface PipeTarget<R = any> {
  /**
   * Called when new data is read from readable source.
   */
  write: (chunk: R) => unknown

  /**
   * Always called once we read all data (if the writable isn't already
   * destroyed by a client disconnect).
   */
  end: () => unknown

  /**
   * An optional method which is called after every write, to support
   * immediately streaming in gzip responses.
   */
  flush?: () => unknown

  /**
   * The close event listener is necessary for us to detect an early client
   * disconnect while we're attempting to read data. This must be done
   * out-of-band so that we can cancel the readable (else we'd have to wait for
   * the readable to produce more data before we could tell it to cancel).
   */
  on: (event: 'close', cb: () => void) => void

  /**
   * Allows us to cleanup our onClose listener.
   */
  off: (event: 'close', cb: () => void) => void

  closed?: boolean
}

export async function pipeReadable(
  readable: ReadableStream<Uint8Array>,
  writable: PipeTarget<Uint8Array>,
  waitUntilForEnd?: Promise<void>
) {
  const reader = readable.getReader()
  let readerDone = false
  let writableClosed = false

  // It's not enough just to check for `writable.destroyed`, because the client
  // may disconnect while we're waiting for a read. We need to immediately
  // cancel the readable, and that requires an out-of-band listener.
  function onClose() {
    writableClosed = true
    writable.off('close', onClose)

    // If the reader is not yet done, we need to cancel it so that the stream
    // source's resources can be cleaned up. If a read is in-progress, this
    // will also ensure the read promise rejects and frees our resources.
    if (!readerDone) {
      readerDone = true
      reader.cancel().catch(() => {})
    }
  }
  writable.on('close', onClose)

  try {
    while (true) {
      const { done, value } = await reader.read()
      readerDone = done

      if (done || writableClosed) {
        break
      }

      if (value) {
        writable.write(value)
        writable.flush?.()
      }
    }
  } catch (e) {
    // If the client disconnects, we don't want to emit an unhandled error.
    if (!isAbortError(e)) {
      throw e
    }
  } finally {
    writable.off('close', onClose)

    // If we broke out of the loop because of a client disconnect, and the
    // close event hasn't yet fired, we can early cancel.
    if (!readerDone) {
      reader.cancel().catch(() => {})
    }

    // If the client hasn't disconnected yet, end the writable so that the
    // response sends the final bytes.
    if (waitUntilForEnd) {
      await waitUntilForEnd
    }

    if (!writableClosed) {
      writable.end()
    }
  }
}
