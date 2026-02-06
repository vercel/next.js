import type { ReactDOMServerReadableStream } from 'react-dom/server'
import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import {
  scheduleImmediate,
  atLeastOneTask,
  waitAtLeastOneReactRenderTask,
} from '../../lib/scheduler'
import { ENCODED_TAGS } from './encoded-tags'
import {
  indexOfUint8Array,
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from './uint8array-helpers'
import { MISSING_ROOT_TAGS_ERROR } from '../../shared/lib/errors/constants'
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

async function streamToChunks(
  stream: ReadableStream<Uint8Array>
): Promise<Array<Uint8Array>> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    chunks.push(value)
  }

  return chunks
}

function concatUint8Arrays(chunks: Array<Uint8Array>): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  return concatUint8Arrays(await streamToChunks(stream))
}

export async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  return Buffer.concat(await streamToChunks(stream))
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
  // Pending flush state: resolve function + promise, avoids DetachedPromise allocation per flush
  let pendingResolve: (() => void) | undefined
  let pendingPromise: Promise<void> | undefined

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
    if (pendingResolve) {
      return
    }

    // Inline the promise creation to avoid DetachedPromise class overhead
    pendingPromise = new Promise<void>((resolve) => {
      pendingResolve = resolve
    })

    scheduleImmediate(() => {
      try {
        flush(controller)
      } finally {
        const resolve = pendingResolve!
        pendingResolve = undefined
        pendingPromise = undefined
        resolve()
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
      return pendingPromise
    },
  })
}

// TODO this is currently unused but once we add proper output:export support, it needs to be
// revisited. See https://github.com/vercel/next.js/pull/89478 for more details
//
// function createPrefetchCommentStream(
//   isBuildTimePrerendering: boolean,
//   buildId: string
// ): TransformStream<Uint8Array, Uint8Array> {
//   // Insert an extra comment at the beginning of the HTML document. This must
//   // come after the DOCTYPE, which is inserted by React.
//   //
//   // The first chunk sent by React will contain the doctype. After that, we can
//   // pass through the rest of the chunks as-is.
//   let didTransformFirstChunk = false
//   return new TransformStream({
//     transform(chunk, controller) {
//       if (isBuildTimePrerendering && !didTransformFirstChunk) {
//         didTransformFirstChunk = true
//         const decoder = new TextDecoder('utf-8', { fatal: true })
//         const chunkStr = decoder.decode(chunk, {
//           stream: true,
//         })
//         const updatedChunkStr = insertBuildIdComment(chunkStr, buildId)
//         controller.enqueue(encoder.encode(updatedChunkStr))
//         return
//       }
//       controller.enqueue(chunk)
//     },
//   })
// }

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

export function createMetadataTransformStream(
  insert: () => Promise<string> | string
): TransformStream<Uint8Array, Uint8Array> {
  let chunkIndex = -1
  let isMarkRemoved = false

  // Extracted async path to avoid making the common (no icon mark) path async.
  // When `transform` is declared async, it always returns a promise even for synchronous paths,
  // adding microtask overhead per chunk. By keeping transform sync and only going async when
  // the icon mark is found, we avoid that overhead for the majority of chunks.
  async function handleIconMark(
    chunk: Uint8Array,
    iconMarkIndex: number,
    iconMarkLength: number,
    controller: TransformStreamDefaultController
  ) {
    // Check if icon mark is inside <head> tag in the first chunk.
    if (chunkIndex === 0) {
      const closedHeadIndex = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
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
  }

  // Pre-computed: a rare byte from the icon mark pattern (0xC2 = 194, the start of « in UTF-8).
  // Used as a fast pre-filter: if this byte isn't in the chunk, the full pattern can't match.
  const iconMarkRareByte = ENCODED_TAGS.META.ICON_MARK[12] // 194 (0xC2)

  return new TransformStream({
    transform(chunk, controller) {
      chunkIndex++

      if (isMarkRemoved) {
        controller.enqueue(chunk)
        return
      }

      // Fast pre-filter: check for a rare byte (0xC2) before doing the full pattern search.
      // Byte 194 (0xC2) is the UTF-8 lead byte for U+0080-U+00BF, which includes « but also
      // other characters. False positives just trigger the full scan which correctly rejects,
      // so this remains a valid fast-path optimization for most chunks.
      if (chunk.indexOf(iconMarkRareByte) === -1) {
        controller.enqueue(chunk)
        return
      }

      const iconMarkIndex = indexOfUint8Array(
        chunk,
        ENCODED_TAGS.META.ICON_MARK
      )
      if (iconMarkIndex === -1) {
        controller.enqueue(chunk)
        return
      }

      // Icon mark found: compute its length and delegate to async handler
      let iconMarkLength = ENCODED_TAGS.META.ICON_MARK.length
      // Check if next char is /, this is for xml mode.
      if (chunk[iconMarkIndex + iconMarkLength] === 47) {
        iconMarkLength += 2
      } else {
        // The last char is `>`
        iconMarkLength++
      }

      return handleIconMark(chunk, iconMarkIndex, iconMarkLength, controller)
    },
  })
}

export function createHeadInsertionTransformStream(
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

export function createFlightDataInjectionTransformStream(
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
export function createMoveSuffixStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
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

function createHtmlDataDplIdTransformStream(
  dplId: string
): TransformStream<Uint8Array, Uint8Array> {
  let didTransform = false

  return new TransformStream({
    transform(chunk, controller) {
      if (didTransform) {
        controller.enqueue(chunk)
        return
      }

      const htmlTagIndex = indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.HTML)
      if (htmlTagIndex === -1) {
        controller.enqueue(chunk)
        return
      }

      // Insert the data-dpl-id attribute right after "<html "
      const insertionPoint = htmlTagIndex + ENCODED_TAGS.OPENING.HTML.length
      const attribute = ` data-dpl-id="${dplId}"`
      const encodedAttribute = encoder.encode(attribute)
      const modifiedChunk = new Uint8Array(
        chunk.length + encodedAttribute.length
      )

      // Copy everything before the insertion point
      modifiedChunk.set(chunk.subarray(0, insertionPoint))
      // Insert the attribute
      modifiedChunk.set(encodedAttribute, insertionPoint)
      // Copy everything after
      modifiedChunk.set(
        chunk.subarray(insertionPoint),
        insertionPoint + encodedAttribute.length
      )

      controller.enqueue(modifiedChunk)
      didTransform = true
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

/**
 * Unified SSR transform that merges buffered batching, metadata icon mark handling,
 * flight data injection, deferred suffix, move-suffix, and head insertion into a
 * single TransformStream. This eliminates ~3 extra TransformStream allocations and
 * the associated microtask hops per chunk in the dynamic SSR path.
 *
 * Architecture: the transform method is synchronous on the hot path (metadata check,
 * suffix stripping, buffering). The async head insertion runs per-batch in the
 * scheduleImmediate flush cycle, not per raw chunk.
 */
export function createUnifiedSSRTransformStream({
  getServerInsertedHTML,
  getServerInsertedMetadata,
  inlinedDataStream,
  suffix,
}: {
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string> | string
  inlinedDataStream: ReadableStream<Uint8Array> | undefined
  suffix: string | null
}): TransformStream<Uint8Array, Uint8Array> {
  // --- buffering state ---
  let bufferedChunks: Array<Uint8Array> = []
  let bufferByteLength = 0
  let pendingResolve: (() => void) | undefined
  let pendingPromise: Promise<void> | undefined

  // --- metadata (icon mark) state ---
  let metadataChunkIndex = -1
  let isIconMarkRemoved = false
  const iconMarkRareByte = ENCODED_TAGS.META.ICON_MARK[12] // 194 (0xC2)

  // --- move suffix (</body></html>) state ---
  let foundSuffix = false

  // --- head insertion state ---
  let headInserted = false
  let hasBytes = false

  // --- deferred suffix state ---
  let suffixFlushed = false

  // --- flight data injection state ---
  let flightPull: Promise<void> | null = null
  let flightDonePulling = false

  // --- first chunk tracking ---
  let firstChunkSeen = false

  function startOrContinuePullingFlightData(
    controller: TransformStreamDefaultController
  ) {
    if (!flightPull) {
      flightPull = startPullingFlightData(controller)
    }
    return flightPull
  }

  async function startPullingFlightData(
    controller: TransformStreamDefaultController
  ) {
    if (!inlinedDataStream) {
      flightDonePulling = true
      return
    }
    const reader = inlinedDataStream.getReader()

    // Wait for the shell to flush before reading flight data
    await atLeastOneTask()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          flightDonePulling = true
          return
        }
        controller.enqueue(value)
      }
    } catch (err) {
      controller.error(err)
    }
  }

  // Apply head insertion to a chunk. Returns the (possibly modified) chunk synchronously
  // if no insertion is needed, or a Promise if insertion is needed.
  function applyHeadInsertion(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ): void | Promise<void> {
    if (headInserted) {
      // After head is inserted, we need to check for new server HTML to prepend.
      // This is async but only allocates a promise when there's actual content.
      const insertionResult = getServerInsertedHTML()
      // Optimistic fast path: if it's a resolved promise with empty string
      // we can't avoid the promise, so always go async here
      return (insertionResult as Promise<string>).then((insertion) => {
        if (insertion) {
          controller.enqueue(encoder.encode(insertion))
        }
        controller.enqueue(chunk)
      })
    }

    // First time: look for </head> in the chunk
    const headIndex = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
    if (headIndex !== -1) {
      headInserted = true
      return (getServerInsertedHTML() as Promise<string>).then((insertion) => {
        if (insertion) {
          const encodedInsertion = encoder.encode(insertion)
          const insertedHeadContent = new Uint8Array(
            chunk.length + encodedInsertion.length
          )
          insertedHeadContent.set(chunk.slice(0, headIndex))
          insertedHeadContent.set(encodedInsertion, headIndex)
          insertedHeadContent.set(
            chunk.slice(headIndex),
            headIndex + encodedInsertion.length
          )
          controller.enqueue(insertedHeadContent)
        } else {
          controller.enqueue(chunk)
        }
      })
    }

    // No </head> found: PPR resume case
    headInserted = true
    return (getServerInsertedHTML() as Promise<string>).then((insertion) => {
      if (insertion) {
        controller.enqueue(encoder.encode(insertion))
      }
      controller.enqueue(chunk)
    })
  }

  function scheduleFlush(controller: TransformStreamDefaultController) {
    if (pendingResolve) return

    pendingPromise = new Promise<void>((resolve) => {
      pendingResolve = resolve
    })

    scheduleImmediate(() => {
      // Synchronously consolidate the buffer
      if (bufferedChunks.length === 0) {
        const r = pendingResolve!
        pendingResolve = undefined
        pendingPromise = undefined
        r()
        return
      }

      let chunk: Uint8Array
      if (bufferedChunks.length === 1) {
        chunk = bufferedChunks[0]
      } else {
        chunk = new Uint8Array(bufferByteLength)
        let copiedBytes = 0
        for (let i = 0; i < bufferedChunks.length; i++) {
          const bufferedChunk = bufferedChunks[i]
          chunk.set(bufferedChunk, copiedBytes)
          copiedBytes += bufferedChunk.byteLength
        }
      }
      bufferedChunks.length = 0
      bufferByteLength = 0

      // Apply head insertion (async) then resolve
      const result = applyHeadInsertion(chunk, controller)
      if (result) {
        result.then(
          () => {
            const r = pendingResolve!
            pendingResolve = undefined
            pendingPromise = undefined
            r()
          },
          (err) => {
            const r = pendingResolve!
            pendingResolve = undefined
            pendingPromise = undefined
            r()
            controller.error(err)
          }
        )
      } else {
        const r = pendingResolve!
        pendingResolve = undefined
        pendingPromise = undefined
        r()
      }
    })
  }

  function bufferChunk(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    bufferedChunks.push(chunk)
    bufferByteLength += chunk.byteLength
    scheduleFlush(controller)
  }

  // Synchronous: strip </body></html> suffix and buffer the chunk.
  function applySuffixStrippingAndBuffer(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    hasBytes = true

    if (foundSuffix) {
      bufferChunk(chunk, controller)
      return
    }

    const suffixIndex = indexOfUint8Array(
      chunk,
      ENCODED_TAGS.CLOSED.BODY_AND_HTML
    )
    if (suffixIndex > -1) {
      foundSuffix = true

      if (chunk.length === ENCODED_TAGS.CLOSED.BODY_AND_HTML.length) {
        // Entire chunk is the suffix, skip (will be added in flush)
        return
      }

      const before = chunk.slice(0, suffixIndex)
      if (before.length > 0) {
        bufferChunk(before, controller)
      }

      if (
        chunk.length >
        ENCODED_TAGS.CLOSED.BODY_AND_HTML.length + suffixIndex
      ) {
        const after = chunk.slice(
          suffixIndex + ENCODED_TAGS.CLOSED.BODY_AND_HTML.length
        )
        bufferChunk(after, controller)
      }
    } else {
      bufferChunk(chunk, controller)
    }
  }

  // Async path for handling icon mark (rare). After processing, continues to sync path.
  async function handleIconMark(
    chunk: Uint8Array,
    iconMarkIndex: number,
    iconMarkLength: number,
    controller: TransformStreamDefaultController
  ) {
    if (metadataChunkIndex === 0) {
      const closedHeadIndex = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
      if (iconMarkIndex !== -1) {
        if (iconMarkIndex < closedHeadIndex) {
          const replaced = new Uint8Array(chunk.length - iconMarkLength)
          replaced.set(chunk.subarray(0, iconMarkIndex))
          replaced.set(
            chunk.subarray(iconMarkIndex + iconMarkLength),
            iconMarkIndex
          )
          chunk = replaced
        } else {
          const insertion = await getServerInsertedMetadata()
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
        isIconMarkRemoved = true
      }
    } else {
      const insertion = await getServerInsertedMetadata()
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
      isIconMarkRemoved = true
    }

    // Continue to sync path
    processChunkPostMetadata(chunk, controller)
  }

  // After metadata processing: suffix stripping + buffer + first-chunk actions.
  // This is the sync hot path for most chunks.
  function processChunkPostMetadata(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    applySuffixStrippingAndBuffer(chunk, controller)

    if (!firstChunkSeen) {
      firstChunkSeen = true

      // Start pulling flight data after the first HTML chunk (fire-and-forget)
      if (inlinedDataStream) {
        startOrContinuePullingFlightData(controller)
      }

      // Insert deferred suffix in next tick (matching createDeferredSuffixStream behavior)
      if (suffix) {
        suffixFlushed = true
        scheduleImmediate(() => {
          applySuffixStrippingAndBuffer(encoder.encode(suffix), controller)
        })
      }
    }
  }

  return new TransformStream({
    transform(chunk, controller) {
      metadataChunkIndex++

      // --- Phase 1: Metadata icon mark handling (rare async path) ---
      if (!isIconMarkRemoved) {
        // Fast pre-filter: check for rare byte before full scan
        if (chunk.indexOf(iconMarkRareByte) !== -1) {
          const iconMarkIndex = indexOfUint8Array(
            chunk,
            ENCODED_TAGS.META.ICON_MARK
          )
          if (iconMarkIndex !== -1) {
            let iconMarkLength = ENCODED_TAGS.META.ICON_MARK.length
            if (chunk[iconMarkIndex + iconMarkLength] === 47) {
              iconMarkLength += 2
            } else {
              iconMarkLength++
            }
            return handleIconMark(
              chunk,
              iconMarkIndex,
              iconMarkLength,
              controller
            )
          }
        }
      }

      // --- Phase 2: Sync hot path: suffix stripping + buffering ---
      processChunkPostMetadata(chunk, controller)
    },
    async flush(controller) {
      // Wait for any pending scheduled flush to complete
      if (pendingPromise) {
        await pendingPromise
      }

      // Flush any remaining buffered chunks with head insertion
      if (bufferedChunks.length > 0) {
        let chunk: Uint8Array
        if (bufferedChunks.length === 1) {
          chunk = bufferedChunks[0]
        } else {
          chunk = new Uint8Array(bufferByteLength)
          let copiedBytes = 0
          for (let i = 0; i < bufferedChunks.length; i++) {
            const bufferedChunk = bufferedChunks[i]
            chunk.set(bufferedChunk, copiedBytes)
            copiedBytes += bufferedChunk.byteLength
          }
        }
        bufferedChunks.length = 0
        bufferByteLength = 0
        await applyHeadInsertion(chunk, controller)
      }

      // Final head insertion: emit any remaining accumulated server-inserted HTML
      if (hasBytes) {
        const insertion = await getServerInsertedHTML()
        if (insertion) {
          controller.enqueue(encoder.encode(insertion))
        }
      }

      // If deferred suffix was never flushed, insert it now
      if (!suffixFlushed && suffix) {
        controller.enqueue(encoder.encode(suffix))
      }

      // Drain remaining flight data
      if (inlinedDataStream && !flightDonePulling) {
        await startOrContinuePullingFlightData(controller)
      }

      // Move suffix flush: always add closing tags at the end
      controller.enqueue(ENCODED_TAGS.CLOSED.BODY_AND_HTML)
    },
  })
}

export type ContinueStreamOptions = {
  inlinedDataStream: ReadableStream<Uint8Array> | undefined
  isStaticGeneration: boolean
  deploymentId: string | undefined
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
    deploymentId,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    validateRootLayout,
  }: ContinueStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  // Suffix itself might contain close tags at the end, so we need to split it.
  const suffixUnclosed = suffix ? suffix.split(CLOSE_TAG, 1)[0] : null

  if (isStaticGeneration) {
    // If we're generating static HTML we need to wait for it to resolve before continuing.
    await renderStream.allReady
  } else {
    // Otherwise, we want to make sure Fizz is done with all microtasky work
    // before we start pulling the stream and cause a flush.
    await waitAtLeastOneReactRenderTask()
  }

  return chainTransformers(renderStream, [
    // Insert data-dpl-id attribute on the html tag
    deploymentId ? createHtmlDataDplIdTransformStream(deploymentId) : null,

    // Validate the root layout for missing html or body tags
    validateRootLayout ? createRootLayoutValidatorStream() : null,

    // Unified SSR transform: merges buffering, metadata icon marks, deferred suffix,
    // flight data injection, suffix movement, and head insertion into a single
    // TransformStream, eliminating ~3 extra stream allocations and microtask hops.
    createUnifiedSSRTransformStream({
      getServerInsertedHTML,
      getServerInsertedMetadata,
      inlinedDataStream,
      suffix:
        suffixUnclosed != null && suffixUnclosed.length > 0
          ? suffixUnclosed
          : null,
    }),
  ])
}

type ContinueDynamicPrerenderOptions = {
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  deploymentId: string | undefined
}

export async function continueDynamicPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueDynamicPrerenderOptions
) {
  return chainTransformers(prerenderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),
    createStripDocumentClosingTagsTransform(),
    // Insert data-dpl-id attribute on the html tag
    deploymentId ? createHtmlDataDplIdTransformStream(deploymentId) : null,
    // Insert generated tags to head
    createHeadInsertionTransformStream(getServerInsertedHTML),
    // Transform metadata
    createMetadataTransformStream(getServerInsertedMetadata),
  ])
}

type ContinueStaticPrerenderOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  deploymentId: string | undefined
}

export async function continueStaticPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueStaticPrerenderOptions
) {
  return chainTransformers(prerenderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),
    // Add build id comment to start of the HTML document (in export mode)
    // Insert data-dpl-id attribute on the html tag
    deploymentId ? createHtmlDataDplIdTransformStream(deploymentId) : null,
    // Insert generated tags to head
    createHeadInsertionTransformStream(getServerInsertedHTML),
    // Transform metadata
    createMetadataTransformStream(getServerInsertedMetadata),
    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    createFlightDataInjectionTransformStream(inlinedDataStream, true),
    // Close tags should always be deferred to the end
    createMoveSuffixStream(),
  ])
}

export async function continueStaticFallbackPrerender(
  prerenderStream: ReadableStream<Uint8Array>,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueStaticPrerenderOptions
) {
  // Same as `continueStaticPrerender`, but also inserts an additional script
  // to instruct the client to start fetching the hydration data as early
  // as possible.
  return chainTransformers(prerenderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),
    // Insert data-dpl-id attribute on the html tag
    deploymentId ? createHtmlDataDplIdTransformStream(deploymentId) : null,
    // Insert generated tags to head
    createHeadInsertionTransformStream(getServerInsertedHTML),
    // Insert the client resume script into the head
    createClientResumeScriptInsertionTransformStream(),
    // Transform metadata
    createMetadataTransformStream(getServerInsertedMetadata),
    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    createFlightDataInjectionTransformStream(inlinedDataStream, true),
    // Close tags should always be deferred to the end
    createMoveSuffixStream(),
  ])
}

type ContinueResumeOptions = {
  inlinedDataStream: ReadableStream<Uint8Array>
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  delayDataUntilFirstHtmlChunk: boolean
  deploymentId: string | undefined
}

export async function continueDynamicHTMLResume(
  renderStream: ReadableStream<Uint8Array>,
  {
    delayDataUntilFirstHtmlChunk,
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueResumeOptions
) {
  return chainTransformers(renderStream, [
    // Buffer everything to avoid flushing too frequently
    createBufferedTransformStream(),
    // Insert data-dpl-id attribute on the html tag
    deploymentId ? createHtmlDataDplIdTransformStream(deploymentId) : null,
    // Insert generated tags to head
    createHeadInsertionTransformStream(getServerInsertedHTML),
    // Transform metadata
    createMetadataTransformStream(getServerInsertedMetadata),
    // Insert the inlined data (Flight data, form state, etc.) stream into the HTML
    createFlightDataInjectionTransformStream(
      inlinedDataStream,
      delayDataUntilFirstHtmlChunk
    ),
    // Close tags should always be deferred to the end
    createMoveSuffixStream(),
  ])
}

export function createDocumentClosingStream(): ReadableStream<Uint8Array> {
  return streamFromString(CLOSE_TAG)
}
