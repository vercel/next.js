import type { FlightRouterState } from '../app-render/types'

import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import { createDecodeTransformStream } from './encode-decode'
import { DetachedPromise } from '../../lib/detached-promise'
import { scheduleImmediate } from '../../lib/scheduler'

export type ReactReadableStream = ReadableStream<Uint8Array> & {
  allReady?: Promise<void> | undefined
}

export function cloneTransformStream(source: TransformStream) {
  const sourceReader = source.readable.getReader()
  const clone = new TransformStream({
    async start(controller) {
      while (true) {
        const { done, value } = await sourceReader.read()
        if (done) {
          break
        }
        controller.enqueue(value)
      }
    },
    // skip all piped chunks
    transform() {},
  })

  return clone
}

export function chainStreams<T>(
  ...streams: ReadableStream<T>[]
): ReadableStream<T> {
  const { readable, writable } = new TransformStream()

  let promise = Promise.resolve()
  for (let i = 0; i < streams.length; ++i) {
    promise = promise.then(() =>
      streams[i].pipeTo(writable, { preventClose: i + 1 < streams.length })
    )
  }

  // Catch any errors from the streams and ignore them, they will be handled
  // by whatever is consuming the readable stream.
  promise.catch(() => {})

  return readable
}

export function streamFromString(str: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str))
      controller.close()
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
  let buffer: Uint8Array = new Uint8Array()
  let pending: DetachedPromise<void> | undefined

  const flush = (controller: TransformStreamDefaultController) => {
    // If we already have a pending flush, then return early.
    if (pending) return

    const detached = new DetachedPromise<void>()
    pending = detached

    scheduleImmediate(() => {
      try {
        controller.enqueue(buffer)
        buffer = new Uint8Array()
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
      const combined = new Uint8Array(buffer.length + chunk.byteLength)
      combined.set(buffer)
      combined.set(chunk, buffer.length)
      buffer = combined

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
  const encoder = new TextEncoder()
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

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new TransformStream({
    async transform(chunk, controller) {
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
      const insertion = await insert()
      if (insertion) {
        controller.enqueue(encoder.encode(insertion))
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

  const encoder = new TextEncoder()

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
  let started = false
  let pending: DetachedPromise<void> | null = null

  const start = (controller: TransformStreamDefaultController) => {
    const reader = stream.getReader()

    // NOTE: streaming flush
    // We are buffering here for the inlined data stream because the
    // "shell" stream might be chunkenized again by the underlying stream
    // implementation, e.g. with a specific high-water mark. To ensure it's
    // the safe timing to pipe the data stream, this extra tick is
    // necessary.
    const detached = new DetachedPromise<void>()
    pending = detached

    // We use `setTimeout/setImmediate` here to ensure that it's inserted after
    // flushing the shell. Note that this implementation might get stale if impl
    // details of Fizz change in the future.
    scheduleImmediate(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return

          controller.enqueue(value)
        }
      } catch (err) {
        controller.error(err)
      } finally {
        detached.resolve()
      }
    })
  }

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      // Start the streaming if it hasn't already been started yet.
      if (started) return
      started = true

      start(controller)
    },
    flush() {
      // If the data stream promise is defined, then return it as its completion
      // will be the completion of the stream.
      if (!pending) return
      if (!started) return

      return pending.promise
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

  const encoder = new TextEncoder()
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

  const encoder = new TextEncoder()
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
  suffix: string | undefined
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

type ContinuePostponedStreamOptions = Pick<
  ContinueStreamOptions,
  | 'inlinedDataStream'
  | 'isStaticGeneration'
  | 'getServerInsertedHTML'
  | 'serverInsertedHTMLToHead'
>

export async function continuePostponedFizzStream(
  renderStream: ReactReadableStream,
  {
    inlinedDataStream,
    isStaticGeneration,
    getServerInsertedHTML,
    serverInsertedHTMLToHead,
  }: ContinuePostponedStreamOptions
) {
  const closeTag = '</body></html>'

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

    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    inlinedDataStream ? createMergedTransformStream(inlinedDataStream) : null,

    // Close tags should always be deferred to the end
    createMoveSuffixStream(closeTag),
  ])
}
