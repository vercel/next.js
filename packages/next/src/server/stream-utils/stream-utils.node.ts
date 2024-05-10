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
import { DetachedPromise } from '../../lib/detached-promise'
import { indexOfUint8Array } from './uint8array-helpers'
import { ENCODED_TAGS } from './encodedTags'


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
  let pending: DetachedPromise<void> | undefined

  const flush = (transform: Transform) => {
    if (pending) return

    const detached = new DetachedPromise<void>()
    pending = detached

    setImmediate(() => {
      try {
        const chunk = new Uint8Array(byteLength)
        let copiedBytes = 0
        for (let i = 0; i < buffered.length; i++) {
          chunk.set(buffered[i], copiedBytes)
          copiedBytes += buffered[i].byteLength
        }
        buffered.length = 0
        byteLength = 0
        transform.push(chunk)
      } catch {
      } finally {
        pending = undefined
        detached.resolve()
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
      if (!pending) callback()

      pending?.promise.then(() => callback())
    },
  })
}

export function createInsertedHTMLStream(
  getServerInsertedHTML: () => Promise<string>
): Transform {
  return new Transform({
    transform(chunk, _, callback) {
      getServerInsertedHTML().then((html) => {
        if (html) {
          this.push(Buffer.from(html))
        }

        return callback(null, chunk)
      })
    },
  })
}

export function createHeadInsertionTransformStream(
  insert: () => Promise<string>
): Transform {
  let inserted = false
  let freezing = false
  let hasBytes = false
  return new Transform({
    transform(chunk, _, callback) {
      hasBytes = true
      if (freezing) {
        return callback(null, chunk)
      }
      insert()
        .then((insertion) => {
          if (inserted) {
            if (insertion) {
              this.push(Buffer.from(insertion))
            }
            this.push(chunk)
            freezing = true
          } else {
            const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
            if (index !== -1) {
              if (insertion) {
                const encodedInsertion = Buffer.from(insertion)
                const insertedHeadContent = Buffer.alloc(
                  chunk.length + encodedInsertion.length
                )
                insertedHeadContent.set(chunk.slice(0, index))
                insertedHeadContent.set(encodedInsertion, index)
                insertedHeadContent.set(
                  chunk.slice(index),
                  index + encodedInsertion.length
                )
                this.push(insertedHeadContent)
              } else {
                this.push(chunk)
              }
              freezing = true
              inserted = true
            }
          }

          if (!inserted) {
            this.push(chunk)
          } else {
            process.nextTick(() => {
              freezing = false
            })
          }

          callback()
        })
        .catch((err) => {
          callback(err)
        })
    },
    final(callback) {
      if (hasBytes) {
        insert()
          .then((insertion) => {
            if (insertion) {
              this.push(Buffer.from(insertion))
              callback()
            }
          })
          .catch((err) => {
            callback(err)
          })
      }
    },
  })
}
