import type { Writable } from 'stream'

export interface Writer {
  // Output a UTF-8 encoded chunk
  write(chunk: Uint8Array): Promise<void>

  buffer(toggle: boolean): void

  // Flush any underlying buffers
  flush(): void

  // Close the stream with an optional error
  close(error?: Error): void
}

export interface Stream {
  (writer: Writer): void
}

export function pipeToNodeWritable(
  stream: Stream,
  writable: Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    let drainState: {
      resolve(): void
      promise: Promise<void>
    } | null = null

    const drainHandler = () => {
      const oldDrainState = drainState
      drainState = null
      oldDrainState?.resolve()
    }
    writable.on('drain', drainHandler)

    stream({
      async write(chunk) {
        writable.write(chunk)

        if (!drainState) {
          let resolve: () => void
          const promise = new Promise<void>((resolver) => {
            resolve = resolver
          })

          drainState = {
            resolve: resolve!,
            promise,
          }
        }

        return drainState.promise
      },

      buffer(toggle) {
        if (toggle) {
          writable.cork()
        } else {
          writable.uncork()
        }
      },

      flush() {
        if (typeof (writable as any).flush === 'function') {
          ;(writable as any).flush()
        }
      },

      close(error) {
        writable.off('drain', drainHandler)
        if (error) {
          writable.destroy(error)
          reject(error)
        } else {
          writable.end()
          resolve()
        }
      },
    })
  })
}

export function pipeToReadableStream(
  stream: Stream,
  writer: WritableStreamDefaultWriter
) {
  let bufferedString = ''
  let pendingFlush: Promise<void> | null = null

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  stream({
    async write(chunk) {
      bufferedString += decoder.decode(chunk)
      if (!pendingFlush) {
        pendingFlush = new Promise((resolve, reject) => {
          setTimeout(() => {
            writer.write(encoder.encode(bufferedString)).then(
              () => resolve(),
              (err) => reject(err)
            )

            bufferedString = ''
            pendingFlush = null
          }, 0)
        })
      }
      return pendingFlush
    },

    buffer(toggle) {
      // noop
    },

    flush() {
      // noop
    },

    close(error) {
      if (error) {
        writer.abort(error)
      } else {
        writer.close()
      }
    },
  })
}

export function chainStreams(streams: Stream[]): Stream {
  return (writer) => {
    let streamIdx = 0
    const processNextStream = () => {
      if (streamIdx < streams.length) {
        const stream = streams[streamIdx++]
        stream({
          write(chunk) {
            return writer.write(chunk)
          },

          buffer(toggle) {
            writer.buffer(toggle)
          },

          flush() {
            writer.flush()
          },

          close(error) {
            if (error) {
              writer.close(error)
            } else {
              processNextStream()
            }
          },
        })
      } else {
        writer.close()
      }
    }

    processNextStream()
  }
}

export function streamFromChunks(chunks: string[]): Stream {
  return (writer) => {
    writer.buffer(true)
    const encoder = new TextEncoder()
    chunks.forEach((chunk) => writer.write(encoder.encode(chunk)))
    writer.buffer(false)
  }
}

export function stringFromStream(stream: Stream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer: string = ''
    const decoder = new TextDecoder()

    stream({
      write(chunk) {
        buffer = buffer + decoder.decode(chunk)
        return Promise.resolve()
      },

      buffer(toggle) {
        // noop
      },

      flush() {
        // noop
      },

      close(error) {
        if (error) {
          reject(error)
        } else {
          resolve(buffer)
        }
      },
    })
  })
}
