import type { ServerResponse } from 'node:http'

import './node-polyfill-web-streams'

export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError'
}

function createWriterFromResponse(
  res: ServerResponse,
  controller: AbortController
): WritableStream<Uint8Array> {
  let started = false
  let finished = false
  let aborted = false

  controller.signal.addEventListener('abort', () => {
    // If we've already finished, we don't need to do anything.
    if (aborted) return

    // We haven't finished writing, so signal to abort.
    aborted = true
    finished = true
    res.end()
  })

  function onClose() {
    // If we've already finished, we don't need to do anything.
    if (finished) return

    // We haven't finished writing, so signal to abort.
    aborted = true
    finished = true
    controller.abort()
  }

  // When the response is closed, we should abort the stream if it hasn't
  // finished yet.
  res.once('close', onClose)

  // Create a writable stream that will write to the response.
  return new WritableStream<Uint8Array>({
    write: async (chunk) => {
      // You'd think we'd want to use `start` instead of placing this in `write`
      // but this ensures that we don't actually flush the headers until we've
      // started writing chunks.
      if (!started) {
        started = true
        res.flushHeaders()
      }

      try {
        const ok = res.write(chunk)
        if (!ok) {
          // If the write returns false, it means there's some backpressure, so
          // wait until it's streamed before continuing.
          await new Promise((resolve) => {
            res.once('drain', resolve)
          })
        }
      } catch (err: any) {
        res.end()

        throw err
      }
    },
    abort: () => {
      finished = true
      res.end()
    },
    close: () => {
      finished = true

      if (res.writableFinished) return

      // Create a promise that will resolve once the response has finished.
      //
      // See: https://nodejs.org/api/http.html#event-finish_1
      //
      const promise = new Promise<void>((resolve) =>
        res.once('finish', () => resolve())
      )

      res.end()
      return promise
    },
  })
}

export async function pipeToNodeResponse(
  readable: ReadableStream<Uint8Array>,
  res: ServerResponse
) {
  try {
    // Create a new AbortController so that we can abort the readable if the
    // client disconnects.
    const controller = new AbortController()

    const writer = createWriterFromResponse(res, controller)

    await readable.pipeTo(writer, { signal: controller.signal })
  } catch (err: any) {
    // If this isn't related to an abort error, re-throw it.
    if (!isAbortError(err)) {
      throw err
    }
  }
}
