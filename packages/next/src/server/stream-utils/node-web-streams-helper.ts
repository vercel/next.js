import type { ReactDOMServerReadableStream } from 'react-dom/server'
import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import { DetachedPromise } from '../../lib/detached-promise'
import { scheduleImmediate, atLeastOneTask } from '../../lib/scheduler'
import { ENCODED_TAGS } from './encoded-tags'
import {
  indexOfUint8Array,
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from './uint8array-helpers'
import { MISSING_ROOT_TAGS_ERROR } from '../../shared/lib/errors/constants'
import { insertBuildIdComment } from '../../shared/lib/segment-cache/output-export-prefetch-encoding'
import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
} from '../../client/components/app-router-headers'
import { computeCacheBustingSearchParam } from '../../shared/lib/router/utils/cache-busting-search-param'

function voidCatch() {
  // this catcher is designed to be used with pipeTo where we expect the underlying
  // pipe implementation to forward errors but we don't want the pipeTo promise to reject
  // and be unhandled
}

// We can share the same encoder instance everywhere
// Notably we cannot do the same for TextDecoder because it is stateful
// when handling streaming data
const encoder = new TextEncoder()

export function chainStreams<T>(
  ...streams: ReadableStream<T>[]
): ReadableStream<T> {
  // If we have no streams, return an empty stream. This behavior is
  // intentional as we're now providing the `RenderResult.EMPTY` value.
  if (streams.length === 0) {
    return new ReadableStream<T>({
      start(controller) {
        controller.close()
      },
    })
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

export type BufferedTransformOptions = {
  /**
   * Flush synchronously once the buffer reaches this many bytes.
   */
  readonly maxBufferByteLength?: number
}

export function createBufferedTransformStream(
  options: BufferedTransformOptions = {}
): TransformStream<Uint8Array, Uint8Array> {
  const { maxBufferByteLength = Infinity } = options

  let bufferedChunks: Array<Uint8Array> = []
  let bufferByteLength: number = 0
  let pending: DetachedPromise<void> | undefined

  const flush = (controller: TransformStreamDefaultController) => {
    try {
      if (bufferedChunks.length === 0) {
        return
      }

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
      // If an error occurs while enqueuing, it can't be due to this
      // transformer. It's most likely caused by the controller having been
      // errored (for example, if the stream was cancelled).
    }
  }

  const scheduleFlush = (controller: TransformStreamDefaultController) => {
    if (pending) {
      return
    }

    const detached = new DetachedPromise<void>()
    pending = detached

    scheduleImmediate(() => {
      try {
        flush(controller)
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

      if (bufferByteLength >= maxBufferByteLength) {
        flush(controller)
      } else {
        scheduleFlush(controller)
      }
    },
    flush() {
      return pending?.promise
    },
  })
}

function createPrefetchCommentStream(
  isBuildTimePrerendering: boolean,
  buildId: string
): TransformStream<Uint8Array, Uint8Array> {
  // Insert an extra comment at the beginning of the HTML document. This must
  // come after the DOCTYPE, which is inserted by React.
  //
  // The first chunk sent by React will contain the doctype. After that, we can
  // pass through the rest of the chunks as-is.
  let didTransformFirstChunk = false
  return new TransformStream({
    transform(chunk, controller) {
      if (isBuildTimePrerendering && !didTransformFirstChunk) {
        didTransformFirstChunk = true
        const decoder = new TextDecoder('utf-8', { fatal: true })
        const chunkStr = decoder.decode(chunk, {
          stream: true,
        })
        const updatedChunkStr = insertBuildIdComment(chunkStr, buildId)
        controller.enqueue(encoder.encode(updatedChunkStr))
        return
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
  ReactDOMServer: {
    renderToReadableStream: typeof import('react-dom/server').renderToReadableStream
  }
  element: React.ReactElement
  streamOptions?: Parameters<typeof ReactDOMServer.renderToReadableStream>[1]
}): Promise<ReactDOMServerReadableStream> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () =>
    ReactDOMServer.renderToReadableStream(element, streamOptions)
  )
}

function createMetadataTransformStream(
  insert: () => Promise<string> | string
): TransformStream<Uint8Array, Uint8Array> {
  let chunkIndex = -1
  let isMarkRemoved = false

  return new TransformStream({
    async transform(chunk, controller) {
      let iconMarkIndex = -1
      let closedHeadIndex = -1
      chunkIndex++

      if (isMarkRemoved) {
        controller.enqueue(chunk)
        return
      }
      let iconMarkLength = 0
      // Only search for the closed head tag once
      if (iconMarkIndex === -1) {
        iconMarkIndex = indexOfUint8Array(chunk, ENCODED_TAGS.META.ICON_MARK)
        if (iconMarkIndex === -1) {
          controller.enqueue(chunk)
          return
        } else {
          // When we found the `<meta name="«nxt-icon»"` tag prefix, we will remove it from the chunk.
          // Its close tag could either be `/>` or `>`, checking the next char to ensure we cover both cases.
          iconMarkLength = ENCODED_TAGS.META.ICON_MARK.length
          // Check if next char is /, this is for xml mode.
          if (chunk[iconMarkIndex + iconMarkLength] === 47) {
            iconMarkLength += 2
          } else {
            // The last char is `>`
            iconMarkLength++
          }
        }
      }

      // Check if icon mark is inside <head> tag in the first chunk.
      if (chunkIndex === 0) {
        closedHeadIndex = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
        if (iconMarkIndex !== -1) {
          // The mark icon is located in the 1st chunk before the head tag.
          // We do not need to insert the script tag in this case because it's in the head.
          // Just remove the icon mark from the chunk.
          if (iconMarkIndex < closedHeadIndex) {
            const replaced = new Uint8Array(chunk.length - iconMarkLength)

            // Remove the icon mark from the chunk.
            replaced.set(chunk.subarray(0, iconMarkIndex))
            replaced.set(
              chunk.subarray(iconMarkIndex + iconMarkLength),
              iconMarkIndex
            )
            chunk = replaced
          } else {
            // The icon mark is after the head tag, replace and insert the script tag at that position.
            const insertion = await insert()
            const encodedInsertion = encoder.encode(insertion)
            const insertionLength = encodedInsertion.length
            const replaced = new Uint8Array(
              chunk.length - iconMarkLength + insertionLength
            )
            replaced.set(chunk.subarray(0, iconMarkIndex))
            replaced.set(encodedInsertion, iconMarkIndex)
            replaced.set(
              chunk.subarray(iconMarkIndex + iconMarkLength),
              iconMarkIndex + insertionLength
            )
            chunk = replaced
          }
          isMarkRemoved = true
        }
        // If there's no icon mark located, it will be handled later when if present in the following chunks.
      } else {
        // When it's appeared in the following chunks, we'll need to
        // remove the mark and then insert the script tag at that position.
        const insertion = await insert()
        const encodedInsertion = encoder.encode(insertion)
        const insertionLength = encodedInsertion.length
        // Replace the icon mark with the hoist script or empty string.
        const replaced = new Uint8Array(
          chunk.length - iconMarkLength + insertionLength
        )
        // Set the first part of the chunk, before the icon mark.
        replaced.set(chunk.subarray(0, iconMarkIndex))
        // Set the insertion after the icon mark.
        replaced.set(encodedInsertion, iconMarkIndex)

        // Set the rest of the chunk after the icon mark.
        replaced.set(
          chunk.subarray(iconMarkIndex + iconMarkLength),
          iconMarkIndex + insertionLength
        )
        chunk = replaced
        isMarkRemoved = true
      }
      controller.enqueue(chunk)
    },
  })
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

function createClientResumeScriptInsertionTransformStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const segmentPath = '/_full'
  const cacheBustingHeader = computeCacheBustingSearchParam(
    '1', //            headers[NEXT_ROUTER_PREFETCH_HEADER]
    '/_full', //       headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]
    undefined, //      headers[NEXT_ROUTER_STATE_TREE_HEADER]
    undefined //       headers[NEXT_URL]
  )
  const searchStr = `${NEXT_RSC_UNION_QUERY}=${cacheBustingHeader}`
  const NEXT_CLIENT_RESUME_SCRIPT = `<script>__NEXT_CLIENT_RESUME=fetch(location.pathname+'?${searchStr}',{credentials:'same-origin',headers:{'${RSC_HEADER}': '1','${NEXT_ROUTER_PREFETCH_HEADER}': '1','${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}': '${segmentPath}'}})</script>`

  let didAlreadyInsert = false
  return new TransformStream({
    transform(chunk, controller) {
      if (didAlreadyInsert) {
        // Already inserted the script into the head. Pass through.
        controller.enqueue(chunk)
        return
      }
      // TODO (@Ethan-Arrowood): Replace the generic `indexOfUint8Array` method with something finely tuned for the subset of things actually being checked for.
      const headClosingTagIndex = indexOfUint8Array(
        chunk,
        ENCODED_TAGS.CLOSED.HEAD
      )

      if (headClosingTagIndex === -1) {
        // In fully static rendering or non PPR rendering cases:
        // `/head>` will always be found in the chunk in first chunk rendering.
        controller.enqueue(chunk)
        return
      }

      const encodedInsertion = encoder.encode(NEXT_CLIENT_RESUME_SCRIPT)
      // Get the total count of the bytes in the chunk and the insertion
      // e.g.
      // chunk = <head><meta charset="utf-8"></head>
      // insertion = <script>...</script>
      // output = <head><meta charset="utf-8"> [ <script>...</script> ] </head>
      const insertedHeadContent = new Uint8Array(
        chunk.length + encodedInsertion.length
      )
      // Append the first part of the chunk, before the head tag
      insertedHeadContent.set(chunk.slice(0, headClosingTagIndex))
      // Append the server inserted content
      insertedHeadContent.set(encodedInsertion, headClosingTagIndex)
      // Append the rest of the chunk
      insertedHeadContent.set(
        chunk.slice(headClosingTagIndex),
        headClosingTagIndex + encodedInsertion.length
      )

      controller.enqueue(insertedHeadContent)
      didAlreadyInsert = true
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

function createFlightDataInjectionTransformStream(
  stream: ReadableStream<Uint8Array>,
  delayDataUntilFirstHtmlChunk: boolean
): TransformStream<Uint8Array, Uint8Array> {
  let htmlStreamFinished = false

  let pull: Promise<void> | null = null
  let donePulling = false

  function startOrContinuePulling(
    controller: TransformStreamDefaultController
  ) {
    if (!pull) {
      pull = startPulling(controller)
    }
    return pull
  }

  async function startPulling(controller: TransformStreamDefaultController) {
    const reader = stream.getReader()

    if (delayDataUntilFirstHtmlChunk) {
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
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          donePulling = true
          return
        }

        // We want to prioritize HTML over RSC data.
        // The SSR render is based on the same RSC stream, so when we get a new RSC chunk,
        // we're likely to produce an HTML chunk as well, so give it a chance to flush first.
        if (!delayDataUntilFirstHtmlChunk && !htmlStreamFinished) {
          await atLeastOneTask()
        }
        controller.enqueue(value)
      }
    } catch (err) {
      controller.error(err)
    }
  }

  return new TransformStream({
    start(controller) {
      if (!delayDataUntilFirstHtmlChunk) {
        startOrContinuePulling(controller)
      }
    },
    transform(chunk, controller) {
      controller.enqueue(chunk)

      // Start the streaming if it hasn't already been started yet.
      if (delayDataUntilFirstHtmlChunk) {
        startOrContinuePulling(controller)
      }
    },
    flush(controller) {
      htmlStreamFinished = true
      if (donePulling) {
        return
      }
      return startOrContinuePulling(controller)
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
      const missingTags: ('html' | 'body')[] = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (!missingTags.length) return

      controller.enqueue(
        encoder.encode(
          `<html id="__next_error__">
            <template
              data-next-error-message="Missing ${missingTags
                .map((c) => `<${c}>`)
                .join(
                  missingTags.length > 1 ? ' and ' : ''
                )} tags in the root layout.\nRead more at https://nextjs.org/docs/messages/missing-root-layout-tags"
              data-next-error-digest="${MISSING_ROOT_TAGS_ERROR}"
              data-next-error-stack=""
            ></template>
          `
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
  isBuildTimePrerendering: boolean
  buildId: string
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  validateRootLayout?: boolean
  /**
   * Suffix to inject after the buffered data, but before the close tags.
   */
  suffix?: string | undefined
}

export async function continueFizzStream(
  renderStream: ReactDOMServerReadableStream,
  {
    suffix,
    inlinedDataStream,
    isStaticGeneration,
    isBuildTimePrerendering,
    buildId,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    validateRootLayout,
  }: ContinueStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  // Suffix itself might contain close tags at the end, so we need to split it.
  const suffixUnclosed = suffix ? suffix.split(CLOSE_TAG, 1)[0] : null

  // If we're generating static HTML we need to wait for it to resolve before continuing.
  if (isStaticGeneration) {
    await renderStream.allReady
  }

  return chainTransformers(renderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),

    // Add build id comment to start of the HTML document (in export mode)
    createPrefetchCommentStream(isBuildTimePrerendering, buildId),

    // Transform metadata
    createMetadataTransformStream(getServerInsertedMetadata),

    // Insert suffix content
    suffixUnclosed != null && suffixUnclosed.length > 0
      ? createDeferredSuffixStream(suffixUnclosed)
      : null,

    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    inlinedDataStream
      ? createFlightDataInjectionTransformStream(inlinedDataStream, true)
      : null,

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
      // Transform metadata
      .pipeThrough(createMetadataTransformStream(getServerInsertedMetadata))
  )
}

type ContinueStaticPrerenderOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  isBuildTimePrerendering: boolean
  buildId: string
}

export async function continueStaticPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    isBuildTimePrerendering,
    buildId,
  }: ContinueStaticPrerenderOptions
) {
  return (
    prerenderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      // Add build id comment to start of the HTML document (in export mode)
      .pipeThrough(
        createPrefetchCommentStream(isBuildTimePrerendering, buildId)
      )
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Transform metadata
      .pipeThrough(createMetadataTransformStream(getServerInsertedMetadata))
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(
        createFlightDataInjectionTransformStream(inlinedDataStream, true)
      )
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream())
  )
}

export async function continueStaticFallbackPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    isBuildTimePrerendering,
    buildId,
  }: ContinueStaticPrerenderOptions
) {
  // Same as `continueStaticPrerender`, but also inserts an additional script
  // to instruct the client to start fetching the hydration data as early
  // as possible.
  return (
    prerenderStream
      // Buffer everything to avoid flushing too frequently
      .pipeThrough(createBufferedTransformStream())
      // Add build id comment to start of the HTML document (in export mode)
      .pipeThrough(
        createPrefetchCommentStream(isBuildTimePrerendering, buildId)
      )
      // Insert generated tags to head
      .pipeThrough(createHeadInsertionTransformStream(getServerInsertedHTML))
      // Insert the client resume script into the head
      .pipeThrough(createClientResumeScriptInsertionTransformStream())
      // Transform metadata
      .pipeThrough(createMetadataTransformStream(getServerInsertedMetadata))
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(
        createFlightDataInjectionTransformStream(inlinedDataStream, true)
      )
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream())
  )
}

type ContinueResumeOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  delayDataUntilFirstHtmlChunk: boolean
}

export async function continueDynamicHTMLResume(
  renderStream: ReadableStream<Uint8Array>,
  {
    delayDataUntilFirstHtmlChunk,
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
      // Transform metadata
      .pipeThrough(createMetadataTransformStream(getServerInsertedMetadata))
      // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
      .pipeThrough(
        createFlightDataInjectionTransformStream(
          inlinedDataStream,
          delayDataUntilFirstHtmlChunk
        )
      )
      // Close tags should always be deferred to the end
      .pipeThrough(createMoveSuffixStream())
  )
}

export function createDocumentClosingStream(): ReadableStream<Uint8Array> {
  return streamFromString(CLOSE_TAG)
}
