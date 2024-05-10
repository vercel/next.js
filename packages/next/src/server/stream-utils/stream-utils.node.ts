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

export function createBufferedTransformStream(): Transform {
  let buffered: Uint8Array[] = []
  let byteLength = 0
  let pending = false

  const flush = (transform: Transform) => {
    if (pending) return

    pending = true

    process.nextTick(() => {
      try {
        const chunk = new Uint8Array(byteLength)
        let copiedBytes = 0
        for (let i = 0; i < buffered.length; i++) {
          chunk.set(buffered[i], copiedBytes)
          copiedBytes += buffered[i].byteLength
        }
        buffered = []
        byteLength = 0
        transform.push(chunk)
      } catch {
      } finally {
        pending = false
      }
    })
  }

  return new Transform({
    transform(chunk, _, callback) {
      buffered.push(chunk)
      byteLength += chunk.byteLength
      flush(this)
      callback()
    },
    final(callback) {
      callback()
    },
  })
}
