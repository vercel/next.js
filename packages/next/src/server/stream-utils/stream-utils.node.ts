/**
 * By default, this file exports the methods from streams-utils.edge since all of those are based on Node.js web streams.
 * This file will then be an incremental re-implementation of all of those methods into Node.js only versions (based on proper Node.js Streams).
 */
import {
  PassThrough,
  Readable,
  Transform,
  Writable,
  pipeline,
} from 'node:stream'
import type { Options as RenderToPipeableStreamOptions } from 'react-dom/server.node'
import isError from '../../lib/is-error'

export * from './stream-utils.edge'

export async function renderToInitialFizzStream({
  element,
  streamOptions,
}: {
  element: React.ReactElement
  streamOptions?: RenderToPipeableStreamOptions
}): Promise<Readable> {
  const ReactDOMServer =
    require('react-dom/server.node') as typeof import('react-dom/server.node')
  return new Promise((resolve, reject) => {
    const { pipe } = ReactDOMServer.renderToPipeableStream(element, {
      ...streamOptions,
      onShellReady() {
        const passThrough = new PassThrough()
        pipe(passThrough)
        resolve(passThrough)
      },
      onShellError(error) {
        reject(error)
      },
    })
  })
}

export async function renderToString(
  element: React.ReactElement
): Promise<string> {
  const ReactDOMServer =
    require('react-dom/server.node') as typeof import('react-dom/server.node')

  return new Promise((resolve, reject) => {
    const { pipe } = ReactDOMServer.renderToPipeableStream(element, {
      onShellReady() {
        let data = ''
        let decoder = new TextDecoder('utf-8', { fatal: true })
        pipe(
          new Writable({
            write(chunk, _, cb) {
              data += decoder.decode(chunk, { stream: true })
              cb()
            },
            final(cb) {
              data += decoder.decode()
              resolve(data)
              cb()
            },
          })
        )
      },
      onShellError(error) {
        reject(error)
      },
    })
  })
}

export async function streamToString(stream: Readable) {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let string = ''

  for await (const chunk of stream) {
    string += decoder.decode(chunk, { stream: true })
  }

  string += decoder.decode()

  return string
}

export function chainStreams(...streams: Readable[]): Readable {
  if (streams.length === 0) {
    throw new Error('Invariant: chainStreams requires at least one stream')
  }
  if (streams.length === 1) {
    return streams[0]
  }

  const transform = new Transform()

  pipeline(streams, transform, (err) => {
    // to match `stream-utils.edge.ts`, this error is just ignored.
    // but maybe we at least log it?
    console.log(`Invariant: error when pipelining streams`)
    console.error(err)
  })

  return transform
}

export function streamFromString(string: string): Readable {
  return Readable.from(string)
}

/**
 * This utility function buffers all of the chunks it receives from the input
 * during a single "macro-task". The transform function schedules a
 * `setImmediate` callback that will push the buffered chunks to the readable.
 * The transform also ensures not to execute the final callback too early. The
 * overall timing of this utility is very specific and must match that of the
 * edge based version.
 */
export function createBufferedTransformStream(): Transform {
  let bufferedChunks: Uint8Array[] = []
  let bufferedChunksByteLength = 0
  let pending = false

  return new Transform({
    transform(chunk, _, callback) {
      bufferedChunks.push(chunk)
      bufferedChunksByteLength += chunk.byteLength

      if (pending) callback()

      pending = true

      setImmediate(() => {
        try {
          const bufferedChunk = new Uint8Array(bufferedChunksByteLength)
          let copiedBytes = 0
          for (let i = 0; i < bufferedChunks.length; i++) {
            bufferedChunk.set(bufferedChunks[i], copiedBytes)
            copiedBytes += bufferedChunks[i].byteLength
          }
          bufferedChunks.length = 0
          bufferedChunksByteLength = 0
          callback(null, bufferedChunk)
        } catch (err: unknown) {
          if (isError(err)) callback(err)
        } finally {
          pending = false
        }
      })
    },
    final(callback) {
      if (!pending) callback()

      process.nextTick(() => {
        callback()
      })
    },
  })
}
