import type { FlightRouterState } from '../app-render/types'

import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import { createDecodeTransformStream } from './encode-decode'
import { DetachedPromise } from '../../lib/detached-promise'
import { scheduleImmediate, atLeastOneTask } from '../../lib/scheduler'

function voidCatch() {
  // this catcher is designed to be used with pipeTo where we expect the underlying
  // pipe implementation to forward errors but we don't want the pipeTo promise to reject
  // and be unhandled
}

export type ReactReadableStream = ReadableStream<Uint8Array> & {
  allReady?: Promise<void> | undefined
}

// We can share the same encoder instance everywhere
// Notably we cannot do the same for TextDecoder because it is stateful
// when handling streaming data
const encoder = new TextEncoder()

export function chainStreams<T>(
  ...streams: ReadableStream<T>[]
): ReadableStream<T> {
  // We could encode this invariant in the arguments but current uses of this function pass
  // use spread so it would be missed by
  if (streams.length === 0) {
    throw new Error('Invariant: chainStreams requires at least one stream')
  }

  // If we only have 1 stream we fast path it by returning just this stream
  if (streams.length === 1) {
    return streams[0]
  }

  const { readable, writable } = new TransformStream()

  // We always initiate pipeTo immediately. We know we have at least 2 streams
  // so we need to avoid closing the writable when this one finishes.
  let promise = streams[0].pipeTo(writable, { preventClose: true })

  let i = 1
  for (; i < streams.length - 1; i++) {
    const nextStream = streams[i]
    promise = promise.then(() =>
      nextStream.pipeTo(writable, { preventClose: true })
    )
  }

  // We can omit the length check because we halted before the last stream and there
  // is at least two streams so the lastStream here will always be defined
  const lastStream = streams[i]
  promise = promise.then(() => lastStream.pipeTo(writable))

  // Catch any errors from the streams and ignore them, they will be handled
  // by whatever is consuming the readable stream.
  promise.catch(voidCatch)

  return readable
}

export function streamFromString(str: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str))
      controller.close()
    },
  })
}

export function concatLazily<T>(...streams: Array<ReadableStream<T>>) {
  if (streams.length < 2) {
    throw new Error(
      'Invariant: concatByteStreams requires at least two streams'
    )
  }

  let streamIndex = 0
  let reader: null | ReadableStreamDefaultReader = null

  return new ReadableStream({
    async pull(controller) {
      if (reader === null) {
        reader = streams[streamIndex++].getReader()
      }

      const { done, value } = await reader.read()
      if (done) {
        if (streamIndex === streams.length) {
          // no more streams
          controller.close()
        } else {
          // We have a second stream to read from. We create the reader now
          // and read from it since the first stream had nothing to enqueue
          reader = streams[streamIndex++].getReader()
          const secondResult = await reader.read()
          if (secondResult.done) {
            controller.close()
          } else {
            controller.enqueue(secondResult.value)
          }
        }
        return
      } else {
        controller.enqueue(value)
      }
    },
  })
}
/**
 * Creates a TransformStream which will merge another ReadableStream into the main stream
 * in a way that is compatible with React's flushing strategy. React will generally flush
 * complete HTML elements in multiple chunks all within a single task. This means that as
 * long as there are no intermediate streams which introduce their own backpressure we can
 * wait for a new Task to spawn and we know that whatever was already written by React is
 * contiguous and we can inject other HTML chunks now before React starts writing again.
 *
 * This Transform assumes that chunks provided by the secondary stream never need to be
 * directly located near their siblings. If we need to support this kind of capability
 * the implemenation will need to get a bit more intelligent about what it considers blocking
 */
export function createMergeHTMLTransform(stream: ReadableStream<Uint8Array>) {
  // Stores the read for the stream we are mergingin into the main stream
  let reader: null | ReadableStreamDefaultReader = null
  // Our pull resolves as a single Promise so we only want to construct it once
  let pendingPull: null | Promise<void> = null
  // Stores state about whether the secondary stream is blocked on the main stream
  let blocked = true
  // Sometimes we cannot write a chunk from our secondary stream because the main
  // stream needs to flush uninterrupted. We hang onto a chunk and enqueue it once
  // the main stream is no longer blocking
  let bufferedChunk: null | Uint8Array = null

  function pullCooperatively(
    controller: TransformStreamDefaultController
  ): Promise<void> {
    blocked = true
    if (pendingPull === null) {
      pendingPull = pull(controller)
    }
    return pendingPull
  }

  async function pull(controller: TransformStreamDefaultController) {
    if (reader === null) {
      reader = stream.getReader()
    }

    // We wait for the current microtask queue to flush
    await atLeastOneTask()
    // We are now in a separate task than the one that scheduled the pull. React should have written
    // everything it had to write up to this point and we are clear to start writing chunks from
    // the stream we are merging in.

    // We will pull as many chunks from the merge second stream as w can until we are blocked again
    blocked = false

    if (bufferedChunk) {
      // We didn't get to enqueue the read from last time
      controller.enqueue(bufferedChunk)
      bufferedChunk = null
    }

    while (true) {
      const result = await reader.read()
      if (result.done) {
        // Regardless of whether we are blocked at this point there is nothing left to write
        // so we end the stream and stop attempting any further pulling
        return
      }

      const chunk: Uint8Array = result.value
      // We have a result now but we can only write it if the main stream has not started
      // writing again. If we need to bail out here the pendingRead will be picked up first
      // by a future pullCooperatively call
      if (blocked) {
        // We schedule another pull to ensure we don't get stuck waiting for the main stream
        bufferedChunk = chunk
        // We return a continuation that schedules another pull when the main stream is unblocked
        return pull(controller)
      } else {
        // We can enqueue the chunk as normal now
        controller.enqueue(chunk)
      }
    }
  }

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      // we only initiate pulling of the secondary stream after we've encountered the closing head
      // chunks. This ensures we
      if (chunksAreEqual(chunk, HEAD_END_TAG)) {
        // We don't await this intentionally, we want the pull to kick off but we don't
        // want to block the stream on it's activity unless we are flushing
        pullCooperatively(controller)
      }
    },
    async flush(controller) {
      // The main stream is done but we need to ensure we have written everything from
      // the stream we are merging in. Block the flush on this resolving
      await pullCooperatively(controller)
    },
  })
}

export async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  let buffer = ''

  await stream
    // Decode the streamed chunks to turn them into strings.
    .pipeThrough(createDecodeTransformStream())
    .pipeTo(
      new WritableStream<string>({
        write(chunk) {
          buffer += chunk
        },
      })
    )

  return buffer
}

export function createBufferedTransformStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let bufferedChunks: Array<Uint8Array> = []
  let bufferByteLength: number = 0
  let pending: DetachedPromise<void> | undefined

  const flush = (controller: TransformStreamDefaultController) => {
    // If we already have a pending flush, then return early.
    if (pending) return

    const detached = new DetachedPromise<void>()
    pending = detached

    scheduleImmediate(() => {
      try {
        const chunk = new Uint8Array(bufferByteLength)
        let copiedBytes = 0
        for (let i = 0; i < bufferedChunks.length; i++) {
          const bufferedChunk = bufferedChunks[i]
          chunk.set(bufferedChunk, copiedBytes)
          copiedBytes += bufferedChunk.byteLength
        }
        // We just wrote all the buffered chunks so we need to reset the bufferedChunks array
        // and our bufferByteLength to prepare for the next round of buffered chunks
        bufferedChunks.length = 0
        bufferByteLength = 0
        controller.enqueue(chunk)
      } catch {
        // If an error occurs while enqueuing it can't be due to this
        // transformers fault. It's likely due to the controller being
        // errored due to the stream being cancelled.
      } finally {
        pending = undefined
        detached.resolve()
      }
    })
  }

  return new TransformStream({
    transform(chunk, controller) {
      // Combine the previous buffer with the new chunk.
      bufferedChunks.push(chunk)
      bufferByteLength += chunk.byteLength

      // Flush the buffer to the controller.
      flush(controller)
    },
    flush() {
      if (!pending) return

      return pending.promise
    },
  })
}

function createInsertedHTMLStream(
  getServerInsertedHTML: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    transform: async (chunk, controller) => {
      const html = await getServerInsertedHTML()
      if (html) {
        controller.enqueue(encoder.encode(html))
      }

      controller.enqueue(chunk)
    },
  })
}

/**
 * unlike createInsertedHTMLStream, this stream will only check for server inserted html once
 * and assumes it is transforming only after the entire prerender is complete
 */
function createInsertServerHTMLForPrerenderTransform(
  getServerInsertedHTML: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  let didInject = false
  let pendingServerHTML: null | Promise<string> = null
  return new TransformStream({
    async transform(chunk, controller) {
      if (pendingServerHTML === null) {
        pendingServerHTML = getServerInsertedHTML()
      }
      if (!didInject && chunksAreEqual(chunk, HEAD_END_TAG)) {
        didInject = true
        // The current chunk is the end tag for the head. we need to wait for the server html to be ready
        const html = await pendingServerHTML
        if (html) {
          controller.enqueue(encoder.encode(html))
        }
      }
      controller.enqueue(chunk)
    },
    async flush(controller) {
      if (!didInject) {
        if (pendingServerHTML === null) {
          pendingServerHTML = getServerInsertedHTML()
        }
        const html = await pendingServerHTML
        if (html) {
          controller.enqueue(encoder.encode(html))
        }
      }
    },
  })
}

export function renderToInitialFizzStream({
  ReactDOMServer,
  element,
  streamOptions,
}: {
  ReactDOMServer: typeof import('react-dom/server.edge')
  element: React.ReactElement
  streamOptions?: any
}): Promise<ReactReadableStream> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () =>
    ReactDOMServer.renderToReadableStream(element, streamOptions)
  )
}

function createHeadInsertionTransformStream(
  insert: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  let inserted = false
  let freezing = false

  const decoder = new TextDecoder()

  // We need to track if this transform saw any bytes because if it didn't
  // we won't want to insert any server HTML at all
  let hasBytes = false

  return new TransformStream({
    async transform(chunk, controller) {
      hasBytes = true
      // While react is flushing chunks, we don't apply insertions
      if (freezing) {
        controller.enqueue(chunk)
        return
      }

      const insertion = await insert()
      if (inserted) {
        controller.enqueue(encoder.encode(insertion))
        controller.enqueue(chunk)
        freezing = true
      } else {
        const content = decoder.decode(chunk)
        const index = content.indexOf('</head>')
        if (index !== -1) {
          const insertedHeadContent =
            content.slice(0, index) + insertion + content.slice(index)
          controller.enqueue(encoder.encode(insertedHeadContent))
          freezing = true
          inserted = true
        }
      }

      if (!inserted) {
        controller.enqueue(chunk)
      } else {
        scheduleImmediate(() => {
          freezing = false
        })
      }
    },
    async flush(controller) {
      // Check before closing if there's anything remaining to insert.
      if (hasBytes) {
        const insertion = await insert()
        if (insertion) {
          controller.enqueue(encoder.encode(insertion))
        }
      }
    },
  })
}

// Suffix after main body content - scripts before </body>,
// but wait for the major chunks to be enqueued.
function createDeferredSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  let flushed = false
  let pending: DetachedPromise<void> | undefined

  const flush = (controller: TransformStreamDefaultController) => {
    const detached = new DetachedPromise<void>()
    pending = detached

    scheduleImmediate(() => {
      try {
        controller.enqueue(encoder.encode(suffix))
      } catch {
        // If an error occurs while enqueuing it can't be due to this
        // transformers fault. It's likely due to the controller being
        // errored due to the stream being cancelled.
      } finally {
        pending = undefined
        detached.resolve()
      }
    })
  }

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      // If we've already flushed, we're done.
      if (flushed) return

      // Schedule the flush to happen.
      flushed = true
      flush(controller)
    },
    flush(controller) {
      if (pending) return pending.promise
      if (flushed) return

      // Flush now.
      controller.enqueue(encoder.encode(suffix))
    },
  })
}

// Merge two streams into one. Ensure the final transform stream is closed
// when both are finished.
function createMergedTransformStream(
  stream: ReadableStream<Uint8Array>
): TransformStream<Uint8Array, Uint8Array> {
  let pull: Promise<void> | null = null
  let donePulling = false

  async function startPulling(controller: TransformStreamDefaultController) {
    if (pull) {
      return
    }

    const reader = stream.getReader()

    // NOTE: streaming flush
    // We are buffering here for the inlined data stream because the
    // "shell" stream might be chunkenized again by the underlying stream
    // implementation, e.g. with a specific high-water mark. To ensure it's
    // the safe timing to pipe the data stream, this extra tick is
    // necessary.

    // We don't start reading until we've left the current Task to ensure
    // that it's inserted after flushing the shell. Note that this implementation
    // might get stale if impl details of Fizz change in the future.
    await atLeastOneTask()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          donePulling = true
          return
        }

        controller.enqueue(value)
      }
    } catch (err) {
      controller.error(err)
    }
  }

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      // Start the streaming if it hasn't already been started yet.
      if (!pull) {
        pull = startPulling(controller)
      }
    },
    flush(controller) {
      if (donePulling) {
        return
      }
      return pull || startPulling(controller)
    },
  })
}

/**
 * This transform stream moves the suffix to the end of the stream, so results
 * like `</body></html><script>...</script>` will be transformed to
 * `<script>...</script></body></html>`.
 */
function createMoveSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  let foundSuffix = false

  const decoder = new TextDecoder()

  return new TransformStream({
    transform(chunk, controller) {
      if (foundSuffix) {
        return controller.enqueue(chunk)
      }

      const buf = decoder.decode(chunk)
      const index = buf.indexOf(suffix)
      if (index > -1) {
        foundSuffix = true

        // If the whole chunk is the suffix, then don't write anything, it will
        // be written in the flush.
        if (buf.length === suffix.length) {
          return
        }

        // Write out the part before the suffix.
        const before = buf.slice(0, index)
        chunk = encoder.encode(before)
        controller.enqueue(chunk)

        // In the case where the suffix is in the middle of the chunk, we need
        // to split the chunk into two parts.
        if (buf.length > suffix.length + index) {
          // Write out the part after the suffix.
          const after = buf.slice(index + suffix.length)
          chunk = encoder.encode(after)
          controller.enqueue(chunk)
        }
      } else {
        controller.enqueue(chunk)
      }
    },
    flush(controller) {
      // Even if we didn't find the suffix, the HTML is not valid if we don't
      // add it, so insert it at the end.
      controller.enqueue(encoder.encode(suffix))
    },
  })
}

export function createRootLayoutValidatorStream(
  assetPrefix = '',
  getTree: () => FlightRouterState
): TransformStream<Uint8Array, Uint8Array> {
  let foundHtml = false
  let foundBody = false

  const decoder = new TextDecoder()

  let content = ''
  return new TransformStream({
    async transform(chunk, controller) {
      // Peek into the streamed chunk to see if the tags are present.
      if (!foundHtml || !foundBody) {
        content += decoder.decode(chunk, { stream: true })
        if (!foundHtml && content.includes('<html')) {
          foundHtml = true
        }
        if (!foundBody && content.includes('<body')) {
          foundBody = true
        }
      }
      controller.enqueue(chunk)
    },
    flush(controller) {
      // Flush the decoder.
      if (!foundHtml || !foundBody) {
        content += decoder.decode()
        if (!foundHtml && content.includes('<html')) {
          foundHtml = true
        }
        if (!foundBody && content.includes('<body')) {
          foundBody = true
        }
      }

      // If html or body tag is missing, we need to inject a script to notify
      // the client.
      const missingTags: string[] = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (missingTags.length > 0) {
        controller.enqueue(
          encoder.encode(
            `<script>self.__next_root_layout_missing_tags_error=${JSON.stringify(
              { missingTags, assetPrefix: assetPrefix ?? '', tree: getTree() }
            )}</script>`
          )
        )
      }
    },
  })
}

function chainTransformers<T>(
  readable: ReadableStream<T>,
  transformers: ReadonlyArray<TransformStream<T, T> | null>
): ReadableStream<T> {
  let stream = readable
  for (const transformer of transformers) {
    if (!transformer) continue

    stream = stream.pipeThrough(transformer)
  }
  return stream
}

export type ContinueStreamOptions = {
  inlinedDataStream: ReadableStream<Uint8Array> | undefined
  isStaticGeneration: boolean
  getServerInsertedHTML: (() => Promise<string>) | undefined
  serverInsertedHTMLToHead: boolean
  validateRootLayout:
    | {
        assetPrefix: string | undefined
        getTree: () => FlightRouterState
      }
    | undefined
  /**
   * Suffix to inject after the buffered data, but before the close tags.
   */
  suffix?: string | undefined
}

export async function continueFizzStream(
  renderStream: ReactReadableStream,
  {
    suffix,
    inlinedDataStream,
    isStaticGeneration,
    getServerInsertedHTML,
    serverInsertedHTMLToHead,
    validateRootLayout,
  }: ContinueStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const closeTag = '</body></html>'

  // Suffix itself might contain close tags at the end, so we need to split it.
  const suffixUnclosed = suffix ? suffix.split(closeTag, 1)[0] : null

  // If we're generating static HTML and there's an `allReady` promise on the
  // stream, we need to wait for it to resolve before continuing.
  if (isStaticGeneration && 'allReady' in renderStream) {
    await renderStream.allReady
  }

  return chainTransformers(renderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),

    // Insert generated tags to head
    getServerInsertedHTML && !serverInsertedHTMLToHead
      ? createInsertedHTMLStream(getServerInsertedHTML)
      : null,

    // Insert suffix content
    suffixUnclosed != null && suffixUnclosed.length > 0
      ? createDeferredSuffixStream(suffixUnclosed)
      : null,

    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    inlinedDataStream ? createMergedTransformStream(inlinedDataStream) : null,

    // Close tags should always be deferred to the end
    createMoveSuffixStream(closeTag),

    // Special head insertions
    // TODO-APP: Insert server side html to end of head in app layout rendering, to avoid
    // hydration errors. Remove this once it's ready to be handled by react itself.
    getServerInsertedHTML && serverInsertedHTMLToHead
      ? createHeadInsertionTransformStream(getServerInsertedHTML)
      : null,

    validateRootLayout
      ? createRootLayoutValidatorStream(
          validateRootLayout.assetPrefix,
          validateRootLayout.getTree
        )
      : null,
  ])
}

type ContinueDynamicPrerenderOptions = {
  getServerInsertedHTML: () => Promise<string>
}

export async function continueDynamicPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  { getServerInsertedHTML }: ContinueDynamicPrerenderOptions
) {
  return stripDocumentCloseTags(prerenderStream).pipeThrough(
    createInsertServerHTMLForPrerenderTransform(getServerInsertedHTML)
  )
}

/**
 * This stream will transform the chunks of a stream such that `</head>` `</body>` and `</html>
 * are always emitted as whole chunks. This allows more precise targeting of various server HTML
 * insertions without requiring a full decode / encode round trip.
 *
 * This technique is still susceptible to bad matches where the byte sequence for these closing
 * tags appears in a context other than HTML such as in a javascript string. This is indistinguishable
 * from a real tag because our chunking is not doing any parsing. This is already a limitation and
 * a proper solution is to just have React expose the capability to inject data at the right place
 * so we will live with this limitation for now
 *
 * One thing this approach does help with beyond avoiding extraneous decode / encode is the ability
 * to match across chunk boundaries.
 */
const HEAD_END_TAG = encoder.encode('</head>')
const BRACKET = /*    */ HEAD_END_TAG[0] // 60  '<'
const SLASH = /*      */ HEAD_END_TAG[1] // 47  '/'
const H = /*          */ HEAD_END_TAG[2] // 104 'h'
const E = /*          */ HEAD_END_TAG[3] // 101 'e'
const A = /*          */ HEAD_END_TAG[4] // 97  'a'
const D = /*          */ HEAD_END_TAG[5] // 100 'd'
const CLOSE = /*      */ HEAD_END_TAG[6] // 62  '>'

const BODY_END_TAG = encoder.encode('</body>')
// const BRACKET = /* */ BODY_END_TAG[0] // 60  '<'
// const SLASH = /*   */ BODY_END_TAG[1] // 47  '/'
const B = /*          */ BODY_END_TAG[2] // 98  'b'
const O = /*          */ BODY_END_TAG[3] // 111 'o'
// const D = /*       */ BODY_END_TAG[4] // 100 'd'
const Y = /*          */ BODY_END_TAG[5] // 121 'y'
// const CLOSE = /*   */ BODY_END_TAG[6] // 62  '>'

const HTML_END_TAG = encoder.encode('</html>')
// const BRACKET = /* */ HTML_END_TAG[0] // 60  '<'
// const SLASH = /*   */ HTML_END_TAG[1] // 47  '/'
// const H = /*       */ HTML_END_TAG[2] // 104 'h'
const T = /*          */ HTML_END_TAG[3] // 116 't'
const M = /*          */ HTML_END_TAG[4] // 109 'm'
const L = /*          */ HTML_END_TAG[5] // 108 'l'
// const CLOSE = /*   */ HTML_END_TAG[6] // 62  '>'

type Sequence = Map<number, Sequence> | Map<number, Uint8Array>
let BracketSequences: Sequence = new Map([
  [
    SLASH,
    new Map([
      [
        H,
        new Map([
          [E, new Map([[A, new Map([[D, new Map([[CLOSE, HEAD_END_TAG]])]])]])],
          [T, new Map([[M, new Map([[L, new Map([[CLOSE, HTML_END_TAG]])]])]])],
        ]),
      ],
      [
        B,
        new Map([
          [O, new Map([[D, new Map([[Y, new Map([[CLOSE, BODY_END_TAG]])]])]])],
        ]),
      ],
    ]),
  ],
])

function chunkReactHTMLStream(
  reactRenderReadable: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader = reactRenderReadable.getReader()
  let currentSequence: null | Sequence = null

  let currentChunk: null | Uint8Array = null
  let bufferedChunk: null | Uint8Array = null

  let destination: null | ReadableByteStreamController = null

  async function pullContinuously() {
    if (destination === null) {
      return
    }

    try {
      /* eslint-disable no-extra-label */
      // We model this continuous pull as a loop to avoid growing the stack with each new chunk
      nextChunk: while (true) {
        if (destination === null) {
          // We're no longer flowing. we'll return here
          return
        }

        let chunk: Uint8Array
        if (currentChunk === null) {
          // We don't have a chunk to consider yet so we need to read one
          const { done, value } = await reader.read()

          if (done) {
            // The stream is done. We flush any previously buffered chunks and close the stream
            if (bufferedChunk) {
              destination.enqueue(bufferedChunk)
            }
            destination.close()
            stopFlowing()
            return
          } else {
            currentChunk = chunk = value
          }
        } else {
          chunk = currentChunk
        }

        // tracks progress in the current chunk
        let chunkCursor = 0
        // tracks progress in a sequence from a certain position within the chunk
        let sequenceCursor = chunkCursor

        // If we already have a bufferedChunk we have something that can satisfy this pull. We should only
        // be in this case if we are in the middle of a sequence so we do a limited search and as soon as
        // we find a match or mismatch we satisfy the pull and terminate
        if (bufferedChunk) {
          nextByte: while (sequenceCursor < chunk.length) {
            if (currentSequence === null) {
              throw new Error(
                'Invariant: bufferedChunk should only be set when we are in a sequence'
              )
            }
            const nextSequence = currentSequence.get(chunk[sequenceCursor])

            if (!nextSequence) {
              // We failed to match the sequence. the current buffered chunk can be enqueued
              destination.enqueue(bufferedChunk)

              // Reset the sequence and buffered chunks state and satisfy the pull
              currentSequence = null
              bufferedChunk = null
              continue nextChunk
            } else if (nextSequence instanceof Map) {
              // We have matched the next step of the sequence.
              // Increment the sequenceCursor and advance the sequence
              sequenceCursor++
              currentSequence = nextSequence
              continue nextByte
            } else {
              // clone the tag bytes to avoid transferring the underlying buffer
              const matchedSequenceChunk: Uint8Array = nextSequence
              // We have found the full sequence. We will enqueue the bufferedChunk and the matched tag chunk
              // and then terminate

              const remainingIndex = sequenceCursor + 1

              // Reset the current chunk
              if (remainingIndex < chunk.byteLength) {
                // Reset the current chunk state to omit matching tag bytes
                currentChunk = chunk.subarray(remainingIndex)
              } else {
                currentChunk = null
              }

              // This will be a negative index removing whatever bytes are part of the sequence
              // but don't fit in the current chunk
              const sequenceOffsetInBuffer =
                remainingIndex - matchedSequenceChunk.byteLength

              // Enqueue the buffered chunk minus the bytes that are part of the sequence
              const precedingBytes = bufferedChunk.subarray(
                0,
                sequenceOffsetInBuffer
              )
              destination.enqueue(precedingBytes)

              // Enqueue the matched sequence by copy
              destination.enqueue(matchedSequenceChunk.slice())

              // Reset the sequence buffered chunk state
              currentSequence = null
              bufferedChunk = null
              continue nextChunk
            }
          }
          // If we exhausted the chunk without either terminating or matching the sequence then the chunk was too small
          // As a hueristic we can infer that a single end tag will be split at most between two segments because React
          // will not chunk things smaller than 512 bytes. So we consider this case a non-match and enqueue the buffered chunk

          // Enqueue the buffered chunk
          destination.enqueue(bufferedChunk)
          bufferedChunk = null

          // Enqueue the current chunk
          destination.enqueue(chunk)
          currentChunk = null

          // Reset the sequence and and process the next chunk
          currentSequence = null
          continue nextChunk
        }

        nextByte: while (sequenceCursor < chunk.length) {
          // We could model the sequence as starting from `<` rather than `/`. This would simplify
          // the branching here but it means we do a map lookup on each iteration rather than just
          // comparing the byte value. What's not clear is whether the branching is more expensive than
          // the map lookup but for now I believe the map lookup would be worse and have opted for the
          // slightly more complex code
          if (currentSequence === null) {
            // We are not in a sequence so we need to find the next one
            if (chunk[sequenceCursor] === BRACKET) {
              // We found a sequence start
              sequenceCursor++
              currentSequence = BracketSequences
            } else {
              // We did not start a sequence so we bump both the sequence and cursor index
              chunkCursor = sequenceCursor += 1
            }
            continue nextByte
          }

          const nextSequence = currentSequence.get(chunk[sequenceCursor])

          if (!nextSequence) {
            // We didn't match the next byte of the sequence, reset it
            // If a sequence fails we know that the next potentially valid sequence can't start
            // before the current sequenceCursor because the we know none of the prior bytes match `<`
            chunkCursor = sequenceCursor += 1
            currentSequence = null
            continue nextByte
          } else if (nextSequence instanceof Map) {
            // We matched the next byte of the sequence
            // Increment the sequenceCursor and advance the sequence
            sequenceCursor++
            currentSequence = nextSequence
            continue nextByte
          } else {
            // We matched a full sequence. We copy here to avoid transferring the underlying buffer

            // The nextSequence is a Uint8Array chunk
            const matchedSequenceChunk: Uint8Array = nextSequence

            // Track the bytes remaining in the chunk
            const remainingIndex = sequenceCursor + 1

            if (nextSequence.byteLength === chunk.byteLength) {
              // The entire chunk is the tag so we can enqueue the chunk and continue pulling

              // nullify the currentChunk because it has not bytes after the sequence
              currentChunk = null

              // Enqueue the tag by reference using the underlying chunk
              const tagBytes = chunk
              destination.enqueue(tagBytes)
            } else if (remainingIndex === chunk.byteLength) {
              // We matched the sequence at the end of the chunk.

              // nullify the currentChunk because it has not bytes after the sequence
              currentChunk = null

              // Enqueue the chunk by reference
              const precedingBytes = chunk.subarray(0, chunkCursor)
              destination.enqueue(precedingBytes)

              // Enqueue the matched sequence by copy
              const tagBytes = matchedSequenceChunk.slice()
              destination.enqueue(tagBytes)
            } else if (chunkCursor > chunk.byteLength / 2) {
              // The bytes before the tag are approximately larger than the bytes following the tag.
              // Transfer bytes underlying bytes and cloning the remainder of the current chunk.

              // Copy the remaining chunk bytes into a new View
              currentChunk = chunk.slice(remainingIndex)

              // Enqueue the part of the chunk before the matching sequence by reference
              const precedecingBytes = chunk.subarray(0, chunkCursor)
              destination.enqueue(precedecingBytes)

              // Enqueue the matched sequence by copy
              const tagBytes = matchedSequenceChunk.slice()
              destination.enqueue(tagBytes)
            } else {
              // The bytes before the tag are approximately smaller than the bytes following the tag.
              // Transfer bytes by clone and retain the original buffer for the current chunk.

              // Create a narrowed View of the current chunk's buffer without copying
              currentChunk = chunk.subarray(remainingIndex)

              if (chunkCursor > 0) {
                // The part before the sequence is non-zero
                // Enqueue the part of the chunk before the matching sequence by copy
                const precedingBytes = chunk.slice(0, chunkCursor)
                destination.enqueue(precedingBytes)
              }

              // Enqueue the matched sequence by copy
              const tagBytes = matchedSequenceChunk.slice()
              destination.enqueue(tagBytes)
            }

            // Reset the sequence and and process the next chunk
            currentSequence = null
            continue nextChunk
          }
        }

        // If we got here we exhausted the chunk without finding a match.

        if (currentSequence) {
          // We are in the middle of a sequence so we can't enqueue the chunk yet and
          // need to check the next chunk before deciding whether to enqueue or not
          bufferedChunk = chunk
          currentChunk = null
        } else {
          // We are not in the middle of a sequence so we can enqueue the chunk
          destination.enqueue(chunk)
          currentChunk = null
        }
        continue nextChunk
        /* eslint-disable no-extra-label */
      }
    } catch (error) {
      if (destination) {
        destination.error(error)
        stopFlowing()
      }
      if (reader) {
        await reader
          .cancel(error)
          .catch((err) =>
            console.error('Error while cancelling React stream reader', err)
          )
      }
    }
  }

  function startFlowing(controller: ReadableByteStreamController) {
    if (destination === null) {
      destination = controller
      pullContinuously()
    }
  }

  function stopFlowing() {
    destination = null
  }

  return new ReadableStream({
    type: 'bytes',
    pull(controller) {
      startFlowing(controller)
    },
    async cancel(reason) {
      stopFlowing()
      await reader
        .cancel(reason)
        .catch((error) =>
          console.error('Error while cancelling React stream reader', error)
        )
    },
  })
}

function stripDocumentCloseTags(
  reactRenderStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  let reader: null | ReadableStreamDefaultReader = null
  return new ReadableStream({
    async pull(controller) {
      if (reader === null) {
        reader = chunkReactHTMLStream(reactRenderStream).getReader()
      }

      // While it looks like we might be eagerly draining the reader
      // we actually are just looping until we find a chunk we can pass forward
      // to satisfy the pull
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          controller.close()
        } else {
          const chunk: Uint8Array = value
          if (chunksAreEqual(chunk, BODY_END_TAG)) {
            continue
          } else if (chunksAreEqual(chunk, HTML_END_TAG)) {
            continue
          } else {
            // not a suffix chunk, pass it forward
            controller.enqueue(chunk)
            return
          }
        }
      }
    },
  })
}

function createDeferDocumentCloseTagsTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let bodyEndTagChunk: null | Uint8Array = null
  let htmlEndTagChunk: null | Uint8Array = null
  return new TransformStream({
    transform(chunk, controller) {
      if (chunksAreEqual(chunk, BODY_END_TAG)) {
        bodyEndTagChunk = chunk
      } else if (chunksAreEqual(chunk, HTML_END_TAG)) {
        htmlEndTagChunk = chunk
      } else {
        controller.enqueue(chunk)
      }
    },
    flush(controller) {
      if (bodyEndTagChunk) {
        controller.enqueue(bodyEndTagChunk)
      }
      if (htmlEndTagChunk) {
        controller.enqueue(htmlEndTagChunk)
      }
    },
  })
}

function chunksAreEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

type ContinueStaticPrerenderOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
}

export async function continueStaticPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  { inlinedDataStream, getServerInsertedHTML }: ContinueStaticPrerenderOptions
) {
  return chunkReactHTMLStream(prerenderStream)
    .pipeThrough(createMergeHTMLTransform(inlinedDataStream))
    .pipeThrough(
      createInsertServerHTMLForPrerenderTransform(getServerInsertedHTML)
    )
    .pipeThrough(createDeferDocumentCloseTagsTransform())
}

type ContinueResumeOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
}

export async function continueDynamicHTMLResume(
  renderStream: ReadableStream<Uint8Array>,
  { inlinedDataStream, getServerInsertedHTML }: ContinueResumeOptions
) {
  const closeTag = '</body></html>'

  return (
    renderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(createMergedTransformStream(inlinedDataStream))
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream(closeTag))
  )
}

type ContinueDynamicDataResumeOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
}

export async function continueDynamicDataResume(
  renderStream: ReadableStream<Uint8Array>,
  { inlinedDataStream }: ContinueDynamicDataResumeOptions
) {
  const closeTag = '</body></html>'

  return (
    renderStream
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(createMergedTransformStream(inlinedDataStream))
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream(closeTag))
  )
}
