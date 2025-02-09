import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import { DetachedPromise } from '../../lib/detached-promise'
import { scheduleImmediate, atLeastOneTask } from '../../lib/scheduler'
import { ENCODED_TAGS } from './encodedTags'
import {
  indexOfUint8Array,
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from './uint8array-helpers'

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

export function streamFromBuffer(chunk: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk)
      controller.close()
    },
  })
}

export async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    chunks.push(value)
  }

  return Buffer.concat(chunks)
}

export async function streamToString(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let string = ''

  for await (const chunk of stream) {
    if (signal?.aborted) {
      return string
    }

    string += decoder.decode(chunk, { stream: true })
  }

  string += decoder.decode()

  return string
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

export function renderToInitialFizzStream({
  ReactDOMServer,
  element,
  streamOptions,
}: {
  ReactDOMServer: typeof import('react-dom/server.edge')
  element: React.ReactElement
  streamOptions?: Parameters<typeof ReactDOMServer.renderToReadableStream>[1]
}): Promise<ReactReadableStream> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () =>
    ReactDOMServer.renderToReadableStream(element, streamOptions)
  )
}

function createHeadInsertionTransformStream(
  insert: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  let inserted = false

  // We need to track if this transform saw any bytes because if it didn't
  // we won't want to insert any server HTML at all
  let hasBytes = false

  return new TransformStream({
    async transform(chunk, controller) {
      hasBytes = true

      const insertion = await insert()
      if (inserted) {
        if (insertion) {
          const encodedInsertion = encoder.encode(insertion)
          controller.enqueue(encodedInsertion)
        }
        controller.enqueue(chunk)
      } else {
        // TODO (@Ethan-Arrowood): Replace the generic `indexOfUint8Array` method with something finely tuned for the subset of things actually being checked for.
        const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
        // In fully static rendering or non PPR rendering cases:
        // `/head>` will always be found in the chunk in first chunk rendering.
        if (index !== -1) {
          if (insertion) {
            const encodedInsertion = encoder.encode(insertion)
            // Get the total count of the bytes in the chunk and the insertion
            // e.g.
            // chunk = <head><meta charset="utf-8"></head>
            // insertion = <script>...</script>
            // output = <head><meta charset="utf-8"> [ <script>...</script> ] </head>
            const insertedHeadContent = new Uint8Array(
              chunk.length + encodedInsertion.length
            )
            // Append the first part of the chunk, before the head tag
            insertedHeadContent.set(chunk.slice(0, index))
            // Append the server inserted content
            insertedHeadContent.set(encodedInsertion, index)
            // Append the rest of the chunk
            insertedHeadContent.set(
              chunk.slice(index),
              index + encodedInsertion.length
            )
            controller.enqueue(insertedHeadContent)
          } else {
            controller.enqueue(chunk)
          }
          inserted = true
        } else {
          // This will happens in PPR rendering during next start, when the page is partially rendered.
          // When the page resumes, the head tag will be found in the middle of the chunk.
          // Where we just need to append the insertion and chunk to the current stream.
          // e.g.
          // PPR-static: <head>...</head><body> [ resume content ] </body>
          // PPR-resume: [ insertion ] [ rest content ]
          if (insertion) {
            controller.enqueue(encoder.encode(insertion))
          }
          controller.enqueue(chunk)
          inserted = true
        }
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

const CLOSE_TAG = '</body></html>'

/**
 * This transform stream moves the suffix to the end of the stream, so results
 * like `</body></html><script>...</script>` will be transformed to
 * `<script>...</script></body></html>`.
 */
function createMoveSuffixStream(): TransformStream<Uint8Array, Uint8Array> {
  let foundSuffix = false

  return new TransformStream({
    transform(chunk, controller) {
      if (foundSuffix) {
        return controller.enqueue(chunk)
      }

      const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML)
      if (index > -1) {
        foundSuffix = true

        // If the whole chunk is the suffix, then don't write anything, it will
        // be written in the flush.
        if (chunk.length === ENCODED_TAGS.CLOSED.BODY_AND_HTML.length) {
          return
        }

        // Write out the part before the suffix.
        const before = chunk.slice(0, index)
        controller.enqueue(before)

        // In the case where the suffix is in the middle of the chunk, we need
        // to split the chunk into two parts.
        if (chunk.length > ENCODED_TAGS.CLOSED.BODY_AND_HTML.length + index) {
          // Write out the part after the suffix.
          const after = chunk.slice(
            index + ENCODED_TAGS.CLOSED.BODY_AND_HTML.length
          )
          controller.enqueue(after)
        }
      } else {
        controller.enqueue(chunk)
      }
    },
    flush(controller) {
      // Even if we didn't find the suffix, the HTML is not valid if we don't
      // add it, so insert it at the end.
      controller.enqueue(ENCODED_TAGS.CLOSED.BODY_AND_HTML)
    },
  })
}

function createStripDocumentClosingTagsTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  return new TransformStream({
    transform(chunk, controller) {
      // We rely on the assumption that chunks will never break across a code unit.
      // This is reasonable because we currently concat all of React's output from a single
      // flush into one chunk before streaming it forward which means the chunk will represent
      // a single coherent utf-8 string. This is not safe to use if we change our streaming to no
      // longer do this large buffered chunk
      if (
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.HTML)
      ) {
        // the entire chunk is the closing tags; return without enqueueing anything.
        return
      }

      // We assume these tags will go at together at the end of the document and that
      // they won't appear anywhere else in the document. This is not really a safe assumption
      // but until we revamp our streaming infra this is a performant way to string the tags
      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY)
      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.HTML)

      controller.enqueue(chunk)
    },
  })
}

/*
 * Checks if the root layout is missing the html or body tags
 * and if so, it will inject a script tag to throw an error in the browser, showing the user
 * the error message in the error overlay.
 */
export function createRootLayoutValidatorStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let foundHtml = false
  let foundBody = false
  return new TransformStream({
    async transform(chunk, controller) {
      // Peek into the streamed chunk to see if the tags are present.
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

      controller.enqueue(chunk)
    },
    flush(controller) {
      const missingTags: typeof window.__next_root_layout_missing_tags = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (!missingTags.length) return

      controller.enqueue(
        encoder.encode(
          `<script>self.__next_root_layout_missing_tags=${JSON.stringify(
            missingTags
          )}</script>`
        )
      )
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
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  validateRootLayout?: boolean
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
    getServerInsertedMetadata,
    validateRootLayout,
  }: ContinueStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  // Suffix itself might contain close tags at the end, so we need to split it.
  const suffixUnclosed = suffix ? suffix.split(CLOSE_TAG, 1)[0] : null

  // If we're generating static HTML and there's an `allReady` promise on the
  // stream, we need to wait for it to resolve before continuing.
  if (isStaticGeneration && 'allReady' in renderStream) {
    await renderStream.allReady
  }

  return chainTransformers(renderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),

    // Insert generated metadata
    createHeadInsertionTransformStream(getServerInsertedMetadata),

    // Insert suffix content
    suffixUnclosed != null && suffixUnclosed.length > 0
      ? createDeferredSuffixStream(suffixUnclosed)
      : null,

    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    inlinedDataStream ? createMergedTransformStream(inlinedDataStream) : null,

    // Validate the root layout for missing html or body tags
    validateRootLayout ? createRootLayoutValidatorStream() : null,

    // Close tags should always be deferred to the end
    createMoveSuffixStream(),

    // Special head insertions
    // TODO-APP: Insert server side html to end of head in app layout rendering, to avoid
    // hydration errors. Remove this once it's ready to be handled by react itself.
    createHeadInsertionTransformStream(getServerInsertedHTML),
  ])
}

type ContinueDynamicPrerenderOptions = {
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
}

export async function continueDynamicPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    getServerInsertedHTML,
    getServerInsertedMetadata,
  }: ContinueDynamicPrerenderOptions
) {
  return (
    prerenderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      .pipeThrough(createStripDocumentClosingTagsTransform())
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Insert generated metadata
      .pipeThrough(
        createHeadInsertionTransformStream(getServerInsertedMetadata)
      )
  )
}

type ContinueStaticPrerenderOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
}

export async function continueStaticPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
  }: ContinueStaticPrerenderOptions
) {
  return (
    prerenderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Insert generated metadata to head
      .pipeThrough(
        createHeadInsertionTransformStream(getServerInsertedMetadata)
      )
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(createMergedTransformStream(inlinedDataStream))
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream())
  )
}

type ContinueResumeOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
}

export async function continueDynamicHTMLResume(
  renderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
  }: ContinueResumeOptions
) {
  return (
    renderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Insert generated metadata to body
      .pipeThrough(
        createHeadInsertionTransformStream(getServerInsertedMetadata)
      )
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(createMergedTransformStream(inlinedDataStream))
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream())
  )
}

export function createDocumentClosingStream(): ReadableStream<Uint8Array> {
  return streamFromString(CLOSE_TAG)
}
