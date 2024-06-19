/**
 * By default, this file exports the methods from streams-utils.edge since all of those are based on Node.js web streams.
 * This file will then be an incremental re-implementation of all of those methods into Node.js only versions (based on proper Node.js Streams).
 */
import type { Stream } from 'node:stream'
import {
  PassThrough,
  Readable,
  Transform,
  Writable,
  pipeline,
} from 'node:stream'
import type {
  PipeableStream,
  Options as RenderToPipeableStreamOptions,
} from 'react-dom/server.node'
import isError from '../../lib/is-error'
import {
  indexOfUint8Array,
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from './uint8array-helpers'
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
        resolve(pipe(new PassThrough()))
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

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const buffers: Buffer[] = []

  for await (const chunk of stream) {
    buffers.push(chunk)
  }

  return Buffer.concat(buffers)
}

export function chainStreams(...streams: Readable[]): Readable {
  if (streams.length === 0) {
    throw new Error('Invariant: chainStreams requires at least one stream')
  }
  if (streams.length === 1) {
    return streams[0]
  }

  const pt = new PassThrough()

  for (const stream of streams) {
    stream.pipe(pt, { end: false })
  }

  pt.end()

  return pt
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

      if (pending) return callback()

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
    flush(callback) {
      if (!pending) return callback()

      process.nextTick(() => {
        callback()
      })
    },
  })
}

const encoder = new TextEncoder()

function createInsertedHTMLStream(
  getServerInsertedHTML: () => Promise<string>
): Transform {
  return new Transform({
    transform(chunk, _, callback) {
      getServerInsertedHTML()
        .then((html) => {
          if (html) {
            this.push(encoder.encode(html))
          }

          return callback(null, chunk)
        })
        .catch((err) => {
          return callback(err)
        })
    },
  })
}

function createHeadInsertionTransformStream(
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
              this.push(encoder.encode(insertion))
            }
            this.push(chunk)
            freezing = true
          } else {
            const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
            if (index !== -1) {
              if (insertion) {
                const encodedInsertion = encoder.encode(insertion)
                const insertedHeadContent = new Uint8Array(
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
            setImmediate(() => {
              freezing = false
            })
          }

          return callback()
        })
        .catch((err) => {
          return callback(err)
        })
    },
    flush(callback) {
      if (hasBytes) {
        return insert()
          .then((insertion) => {
            return callback(null, insertion && encoder.encode(insertion))
          })
          .catch((err) => {
            return callback(err)
          })
      }

      return callback()
    },
  })
}

function createDeferredSuffixStream(suffix: string): Transform {
  let flushed = false
  let pending = false

  return new Transform({
    transform(chunk, _, callback) {
      this.push(chunk)

      if (flushed) return callback()

      flushed = true
      pending = true
      setImmediate(() => {
        try {
          this.push(encoder.encode(suffix))
        } catch {
        } finally {
          pending = false
          return callback()
        }
      })
    },
    flush(callback) {
      if (pending || flushed) return callback()
      return callback(null, encoder.encode(suffix))
    },
  })
}

function createMoveSuffixStream(suffix: string): Transform {
  let found = false
  const encodedSuffix = encoder.encode(suffix)
  return new Transform({
    transform(chunk, _, callback) {
      if (found) {
        return callback(null, chunk)
      }

      const index = indexOfUint8Array(chunk, encodedSuffix)
      if (index > -1) {
        found = true

        if (chunk.length === suffix.length) {
          return callback()
        }

        const before = chunk.slice(0, index)
        this.push(before)

        if (chunk.length > suffix.length + index) {
          return callback(null, chunk.slice(index + suffix.length))
        }
      } else {
        return callback(null, chunk)
      }
    },
    flush(callback) {
      return callback(null, encodedSuffix)
    },
  })
}

// eslint-disable-next-line
function createStripDocumentClosingTagsTransform(): Transform {
  return new Transform({
    transform(chunk, _, callback) {
      if (
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.HTML)
      ) {
        return callback()
      }

      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY)
      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.HTML)

      return callback(null, chunk)
    },
  })
}

function createRootLayoutValidatorStream(): Transform {
  let foundHtml = false
  let foundBody = false
  return new Transform({
    transform(chunk, _, callback) {
      if (
        !foundHtml &&
        indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.HTML) > -1
      ) {
        foundHtml = true
      }

      if (
        !foundBody &&
        indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.BODY) > -1
      ) {
        foundBody = true
      }

      return callback(null, chunk)
    },
    flush(callback) {
      const missingTags: typeof window.__next_root_layout_missing_tags = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (!missingTags.length) return

      return callback(
        null,
        encoder.encode(
          `<script>self.__next_root_layout_missing_tags=${JSON.stringify(
            missingTags
          )}</script>`
        )
      )
    },
  })
}

export function continueFizzStream(
  renderStream: Readable,
  {
    suffix,
    inlinedDataStream,
    // eslint-disable-next-line
    isStaticGeneration,
    getServerInsertedHTML,
    serverInsertedHTMLToHead,
    validateRootLayout,
  }: {
    inlinedDataStream?: Readable
    isStaticGeneration: boolean
    getServerInsertedHTML?: () => Promise<string>
    serverInsertedHTMLToHead: boolean
    validateRootLayout?: boolean
    suffix?: string
  }
): Promise<Readable> {
  const closeTag = '</body></html>'
  const suffixUnclosed = suffix ? suffix.split(closeTag, 1)[0] : null

  // this doesn't make sense anymore, but keep it in mind if there are issues rendering static stuff. the renderToInitialFizzStream may be calling `pipe` either in `onShellReady` or `onAllReady`
  // if (isStaticGeneration && 'allReady' in renderStream) {
  //   await renderStream.allReady
  // }

  const pt = new PassThrough()

  const streams: Stream[] = [renderStream, createBufferedTransformStream()]

  if (getServerInsertedHTML && !serverInsertedHTMLToHead) {
    streams.push(createInsertedHTMLStream(getServerInsertedHTML))
  }

  if (suffixUnclosed != null && suffixUnclosed.length > 0) {
    streams.push(createDeferredSuffixStream(suffixUnclosed))
  }

  if (inlinedDataStream) {
    streams.push(inlinedDataStream.pipe(new PassThrough()))
  }

  if (validateRootLayout) {
    streams.push(createRootLayoutValidatorStream())
  }

  streams.push(createMoveSuffixStream(closeTag))

  if (getServerInsertedHTML && serverInsertedHTMLToHead) {
    streams.push(createHeadInsertionTransformStream(getServerInsertedHTML))
  }

  streams.push(pt)

  return new Promise((resolve, reject) => {
    // @ts-expect-error
    pipeline(streams, (error) => {
      if (error) return reject(error)
      else return resolve(pt)
    })
  })
}

export function teeReadable(
  stream: PipeableStream | Readable
): [Readable, Readable] {
  if (!(stream instanceof Readable)) {
    stream = stream.pipe(new PassThrough())
  }
  return [stream.pipe(new PassThrough()), stream.pipe(new PassThrough())]
}

export type ContinueStaticPrerenderOptions = {
  inlinedDataStream: Readable
  getServerInsertedHTML: () => Promise<string>
}

export async function continueStaticPrerender(
  prerenderStream: Readable,
  { inlinedDataStream, getServerInsertedHTML }: ContinueStaticPrerenderOptions
) {
  const closeTag = '</body></html>'

  return prerenderStream
    .pipe(createBufferedTransformStream())
    .pipe(createHeadInsertionTransformStream(getServerInsertedHTML))
    .pipe(inlinedDataStream.pipe(new PassThrough()))
    .pipe(createMoveSuffixStream(closeTag))
}

type ContinueResumeOptions = {
  inlinedDataStream: Readable
  getServerInsertedHTML: () => Promise<string>
}

export async function continueDynamicHTMLResume(
  renderStream: Readable,
  { inlinedDataStream, getServerInsertedHTML }: ContinueResumeOptions
) {
  const closeTag = '</body></html>'

  return renderStream
    .pipe(createBufferedTransformStream())
    .pipe(createHeadInsertionTransformStream(getServerInsertedHTML))
    .pipe(inlinedDataStream.pipe(new PassThrough()))
    .pipe(createMoveSuffixStream(closeTag))
}

type ContinueDynamicDataResumeOptions = {
  inlinedDataStream: Readable
}

export async function continueDynamicDataResume(
  renderStream: Readable,
  { inlinedDataStream }: ContinueDynamicDataResumeOptions
) {
  const closeTag = '</body></html>'

  return (
    renderStream
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipe(inlinedDataStream.pipe(new PassThrough()))
      // Close tags should always be deferred to the end
      .pipe(createMoveSuffixStream(closeTag))
  )
}
