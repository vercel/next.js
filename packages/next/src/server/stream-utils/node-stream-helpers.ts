import type { Readable, Transform } from 'node:stream'

// Lazy require to avoid webpack trying to resolve node:stream at parse time.
// When __NEXT_USE_NODE_STREAMS is false, DCE removes all call sites so this
// require() is never reached at runtime.
function getNodeStream(): typeof import('node:stream') {
  return require('node:stream') as typeof import('node:stream')
}
import { DetachedPromise } from '../../lib/detached-promise'
import {
  scheduleImmediate,
  atLeastOneTask,
  waitAtLeastOneReactRenderTask,
} from '../../lib/scheduler'
import { ENCODED_TAGS } from './encoded-tags'
import {
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from './uint8array-helpers'

// Pre-computed Buffer versions of encoded tags for fast native indexOf.
// Buffer.indexOf uses a C++ implementation that is significantly faster than
// the JS-based indexOfUint8Array for chunks >~30 bytes (1.3-3.2x measured).
const BUFFER_TAGS = {
  OPENING: {
    HTML: Buffer.from(ENCODED_TAGS.OPENING.HTML),
    BODY: Buffer.from(ENCODED_TAGS.OPENING.BODY),
  },
  CLOSED: {
    HEAD: Buffer.from(ENCODED_TAGS.CLOSED.HEAD),
    BODY_AND_HTML: Buffer.from(ENCODED_TAGS.CLOSED.BODY_AND_HTML),
  },
  META: {
    ICON_MARK: Buffer.from(ENCODED_TAGS.META.ICON_MARK),
  },
} as const

/**
 * Uses native Buffer.indexOf (C++) for pattern matching.
 * ~1.3-3.2x faster than the JS indexOfUint8Array for typical chunk sizes.
 */
function bufferIndexOf(chunk: Uint8Array, needle: Buffer): number {
  const buf = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  return buf.indexOf(needle)
}
import { MISSING_ROOT_TAGS_ERROR } from '../../shared/lib/errors/constants'
import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
} from '../../client/components/app-router-headers'
import { computeCacheBustingSearchParam } from '../../shared/lib/router/utils/cache-busting-search-param'

const encoder = new TextEncoder()

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function nodeStreamFromString(str: string): Readable {
  const { PassThrough: PT } = getNodeStream()
  const pt = new PT()
  pt.end(encoder.encode(str))
  return pt
}

export function nodeStreamFromBuffer(buf: Buffer | Uint8Array): Readable {
  const { PassThrough: PT } = getNodeStream()
  const pt = new PT()
  pt.end(buf)
  return pt
}

export async function nodeStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function nodeStreamToString(stream: Readable): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let result = ''
  for await (const chunk of stream) {
    result += decoder.decode(chunk, { stream: true })
  }
  result += decoder.decode()
  return result
}

// ---------------------------------------------------------------------------
// Stream composition utilities
// ---------------------------------------------------------------------------

/**
 * Pipes source to dest while forwarding errors from source to dest.
 * Node.js `.pipe()` does not propagate errors by default, which can cause
 * destinations to hang indefinitely if the source errors.
 */
export function safePipe<T extends Transform>(source: Readable, dest: T): T {
  source.on('error', (err) => {
    if (!dest.destroyed) {
      dest.destroy(err)
    }
  })
  source.pipe(dest)
  return dest
}

/**
 * Chains a Readable through a series of Transform streams using .pipe().
 * Returns the final Readable in the chain.
 */
export function chainNodeTransforms(
  readable: Readable,
  transforms: ReadonlyArray<Transform | null>
): Readable {
  let stream: Readable = readable
  for (const transform of transforms) {
    if (!transform) continue
    stream = safePipe(stream, transform)
  }
  return stream
}

/**
 * Concatenates multiple Readable streams sequentially into a single Readable.
 * Each stream is fully consumed before moving to the next.
 */
export function chainNodeStreams(...streams: Readable[]): Readable {
  const { PassThrough: PT } = getNodeStream()
  if (streams.length === 0) {
    const pt = new PT()
    pt.end()
    return pt
  }
  if (streams.length === 1) {
    return streams[0]
  }

  const output = new PT()
  let index = 0

  function pipeNext() {
    if (index >= streams.length) {
      output.end()
      return
    }
    const current = streams[index++]
    current.once('error', (err) => {
      // Destroy remaining streams on error
      for (let i = index; i < streams.length; i++) {
        if (!streams[i].destroyed) streams[i].destroy()
      }
      if (!output.destroyed) output.destroy(err)
    })
    current.pipe(output, { end: false })
    current.once('end', pipeNext)
  }

  pipeNext()
  return output
}

// ---------------------------------------------------------------------------
// Transform streams (Node.js equivalents of web TransformStreams)
// ---------------------------------------------------------------------------

export function createBufferedTransformNode(
  options: { maxBufferByteLength?: number } = {}
): Transform {
  const { maxBufferByteLength = Infinity } = options
  let bufferedChunks: Array<Uint8Array | Buffer> = []
  let allBufferChunks = true
  let bufferByteLength = 0
  let pending: DetachedPromise<void> | undefined
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (allBufferChunks && !Buffer.isBuffer(chunk)) {
        allBufferChunks = false
      }
      bufferedChunks.push(chunk)
      bufferByteLength += chunk.byteLength

      if (bufferByteLength >= maxBufferByteLength) {
        flushBuffer(this)
        callback()
      } else {
        if (!pending) {
          const detached = new DetachedPromise<void>()
          pending = detached
          scheduleImmediate(() => {
            try {
              flushBuffer(this)
            } finally {
              pending = undefined
              detached.resolve()
            }
          })
        }
        callback()
      }
    },
    flush(callback) {
      if (pending) {
        pending.promise.then(() => {
          flushBuffer(this)
          callback()
        })
      } else {
        flushBuffer(this)
        callback()
      }
    },
  })

  function flushBuffer(transform: Transform) {
    if (bufferedChunks.length === 0) return

    // Fast path: avoid concat/copy when we only buffered one chunk.
    if (bufferedChunks.length === 1) {
      const [onlyChunk] = bufferedChunks
      bufferedChunks.length = 0
      bufferByteLength = 0
      allBufferChunks = true
      transform.push(onlyChunk)
      return
    }

    let total: Buffer | Uint8Array
    if (allBufferChunks) {
      total = Buffer.concat(bufferedChunks as Buffer[], bufferByteLength)
    } else {
      total = new Uint8Array(bufferByteLength)
      let offset = 0
      for (const chunk of bufferedChunks) {
        total.set(chunk, offset)
        offset += chunk.byteLength
      }
    }

    bufferedChunks.length = 0
    bufferByteLength = 0
    allBufferChunks = true
    transform.push(total)
  }
}

export function createHtmlDataDplIdTransformNode(dplId: string): Transform {
  let didTransform = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (didTransform) {
        this.push(chunk)
        return callback()
      }

      const htmlTagIndex = bufferIndexOf(chunk, BUFFER_TAGS.OPENING.HTML)
      if (htmlTagIndex === -1) {
        this.push(chunk)
        return callback()
      }

      const insertionPoint = htmlTagIndex + ENCODED_TAGS.OPENING.HTML.length
      const attribute = ` data-dpl-id="${dplId}"`
      const encodedAttribute = encoder.encode(attribute)
      const modifiedChunk = new Uint8Array(
        chunk.length + encodedAttribute.length
      )
      modifiedChunk.set(chunk.subarray(0, insertionPoint))
      modifiedChunk.set(encodedAttribute, insertionPoint)
      modifiedChunk.set(
        chunk.subarray(insertionPoint),
        insertionPoint + encodedAttribute.length
      )
      this.push(modifiedChunk)
      didTransform = true
      callback()
    },
  })
}

export function createMetadataTransformNode(
  insert: () => Promise<string> | string
): Transform {
  let chunkIndex = -1
  let isMarkRemoved = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      chunkIndex++

      if (isMarkRemoved) {
        this.push(chunk)
        return callback()
      }

      let iconMarkIndex = bufferIndexOf(chunk, BUFFER_TAGS.META.ICON_MARK)
      if (iconMarkIndex === -1) {
        this.push(chunk)
        return callback()
      }

      let iconMarkLength = ENCODED_TAGS.META.ICON_MARK.length
      if (chunk[iconMarkIndex + iconMarkLength] === 47) {
        iconMarkLength += 2
      } else {
        iconMarkLength++
      }

      const doTransform = async () => {
        if (chunkIndex === 0) {
          const closedHeadIndex = bufferIndexOf(chunk, BUFFER_TAGS.CLOSED.HEAD)
          if (iconMarkIndex < closedHeadIndex) {
            const replaced = new Uint8Array(chunk.length - iconMarkLength)
            replaced.set(chunk.subarray(0, iconMarkIndex))
            replaced.set(
              chunk.subarray(iconMarkIndex + iconMarkLength),
              iconMarkIndex
            )
            chunk = replaced
          } else {
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
        } else {
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
        this.push(chunk)
        callback()
      }

      doTransform().catch(callback)
    },
  })
}

export function createDeferredSuffixTransformNode(suffix: string): Transform {
  let flushed = false
  let pendingPromise: Promise<void> | undefined
  const { Transform: T } = getNodeStream()
  const encodedSuffix = encoder.encode(suffix)

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      this.push(chunk)

      if (flushed) return callback()

      flushed = true
      const deferred = new DetachedPromise<void>()
      pendingPromise = deferred.promise

      scheduleImmediate(() => {
        try {
          this.push(encodedSuffix)
        } catch {
          // Ignore errors from destroyed stream
        } finally {
          deferred.resolve()
        }
      })

      callback()
    },
    flush(callback) {
      if (pendingPromise) {
        // Wait for the scheduled suffix push to complete before finishing
        pendingPromise.then(() => callback()).catch(callback)
        return
      }
      if (!flushed) {
        this.push(encodedSuffix)
      }
      callback()
    },
  })
}

export function createFlightDataInjectionTransformNode(
  dataStream: Readable,
  delayDataUntilFirstHtmlChunk: boolean
): Transform {
  let htmlStreamFinished = false
  let pullStarted = false
  let donePulling = false

  // Initialize pullDeferred eagerly to avoid the race condition where
  // flush() is called before the scheduleImmediate callback assigns it.
  const pullDeferred = new DetachedPromise<void>()
  const { Transform: T } = getNodeStream()

  const transform = new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      this.push(chunk)

      if (delayDataUntilFirstHtmlChunk && !pullStarted) {
        pullStarted = true
        startPulling(this).then(
          () => pullDeferred.resolve(),
          (err) => pullDeferred.reject(err)
        )
      }

      callback()
    },
    flush(callback) {
      htmlStreamFinished = true
      if (donePulling) {
        return callback()
      }
      if (!pullStarted) {
        pullStarted = true
        startPulling(this).then(
          () => pullDeferred.resolve(),
          (err) => pullDeferred.reject(err)
        )
      }
      pullDeferred.promise.then(() => callback()).catch(callback)
    },
  })

  // Handle dataStream errors that occur before pulling starts (e.g. when
  // delayDataUntilFirstHtmlChunk is true and no HTML chunk has arrived yet).
  // Without this, an early error on dataStream would be silently lost and
  // the transform would hang indefinitely.
  dataStream.once('error', (err) => {
    if (!transform.destroyed) {
      transform.destroy(err)
    }
  })

  if (!delayDataUntilFirstHtmlChunk) {
    pullStarted = true
    // Start pulling on next tick to allow the transform to be set up
    scheduleImmediate(() => {
      if (transform.destroyed) {
        pullDeferred.resolve()
        return
      }
      startPulling(transform).then(
        () => pullDeferred.resolve(),
        (err) => pullDeferred.reject(err)
      )
    })
  }

  async function startPulling(dest: Transform) {
    if (delayDataUntilFirstHtmlChunk) {
      await atLeastOneTask()
    }

    try {
      for await (const value of dataStream) {
        if (!delayDataUntilFirstHtmlChunk && !htmlStreamFinished) {
          await atLeastOneTask()
        }
        if (dest.destroyed) break
        dest.push(value)
      }
    } catch (err) {
      if (!dest.destroyed) {
        dest.destroy(err as Error)
      }
    }
    donePulling = true
  }

  return transform
}

export function createRootLayoutValidatorTransformNode(): Transform {
  let foundHtml = false
  let foundBody = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (!foundHtml && bufferIndexOf(chunk, BUFFER_TAGS.OPENING.HTML) > -1) {
        foundHtml = true
      }
      if (!foundBody && bufferIndexOf(chunk, BUFFER_TAGS.OPENING.BODY) > -1) {
        foundBody = true
      }
      this.push(chunk)
      callback()
    },
    flush(callback) {
      const missingTags: ('html' | 'body')[] = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (missingTags.length) {
        this.push(
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
      }
      callback()
    },
  })
}

export function createMoveSuffixTransformNode(): Transform {
  let foundSuffix = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (foundSuffix) {
        this.push(chunk)
        return callback()
      }

      const index = bufferIndexOf(chunk, BUFFER_TAGS.CLOSED.BODY_AND_HTML)
      if (index > -1) {
        foundSuffix = true
        if (chunk.length === ENCODED_TAGS.CLOSED.BODY_AND_HTML.length) {
          return callback()
        }
        const before = chunk.slice(0, index)
        this.push(before)
        if (chunk.length > ENCODED_TAGS.CLOSED.BODY_AND_HTML.length + index) {
          const after = chunk.slice(
            index + ENCODED_TAGS.CLOSED.BODY_AND_HTML.length
          )
          this.push(after)
        }
      } else {
        this.push(chunk)
      }
      callback()
    },
    flush(callback) {
      this.push(ENCODED_TAGS.CLOSED.BODY_AND_HTML)
      callback()
    },
  })
}

export function createHeadInsertionTransformNode(
  insert: () => Promise<string>
): Transform {
  let inserted = false
  let hasBytes = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      hasBytes = true

      const doTransform = async () => {
        const insertion = await insert()

        if (inserted) {
          if (insertion) {
            this.push(encoder.encode(insertion))
          }
          this.push(chunk)
          return
        }

        const index = bufferIndexOf(chunk, BUFFER_TAGS.CLOSED.HEAD)
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
          inserted = true
        } else {
          if (insertion) {
            this.push(encoder.encode(insertion))
          }
          this.push(chunk)
          inserted = true
        }
      }

      doTransform()
        .then(() => callback())
        .catch(callback)
    },
    flush(callback) {
      if (!hasBytes) return callback()

      insert()
        .then((insertion) => {
          if (insertion) {
            this.push(encoder.encode(insertion))
          }
          callback()
        })
        .catch(callback)
    },
  })
}

export function createClientResumeScriptInsertionTransformNode(): Transform {
  const segmentPath = '/_full'
  const cacheBustingHeader = computeCacheBustingSearchParam(
    '1',
    '/_full',
    undefined,
    undefined
  )
  const searchStr = `${NEXT_RSC_UNION_QUERY}=${cacheBustingHeader}`
  const NEXT_CLIENT_RESUME_SCRIPT = `<script>__NEXT_CLIENT_RESUME=fetch(location.pathname+'?${searchStr}',{credentials:'same-origin',headers:{'${RSC_HEADER}': '1','${NEXT_ROUTER_PREFETCH_HEADER}': '1','${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}': '${segmentPath}'}})</script>`

  let didAlreadyInsert = false
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (didAlreadyInsert) {
        this.push(chunk)
        return callback()
      }

      const headClosingTagIndex = bufferIndexOf(chunk, BUFFER_TAGS.CLOSED.HEAD)
      if (headClosingTagIndex === -1) {
        this.push(chunk)
        return callback()
      }

      const encodedInsertion = encoder.encode(NEXT_CLIENT_RESUME_SCRIPT)
      const insertedHeadContent = new Uint8Array(
        chunk.length + encodedInsertion.length
      )
      insertedHeadContent.set(chunk.slice(0, headClosingTagIndex))
      insertedHeadContent.set(encodedInsertion, headClosingTagIndex)
      insertedHeadContent.set(
        chunk.slice(headClosingTagIndex),
        headClosingTagIndex + encodedInsertion.length
      )
      this.push(insertedHeadContent)
      didAlreadyInsert = true
      callback()
    },
  })
}

export function createStripDocumentClosingTagsTransformNode(): Transform {
  const { Transform: T } = getNodeStream()
  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.BODY) ||
        isEquivalentUint8Arrays(chunk, ENCODED_TAGS.CLOSED.HTML)
      ) {
        return callback()
      }

      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY)
      chunk = removeFromUint8Array(chunk, ENCODED_TAGS.CLOSED.HTML)
      this.push(chunk)
      callback()
    },
  })
}

// ---------------------------------------------------------------------------
// Continue-stream functions (Node.js equivalents)
// ---------------------------------------------------------------------------

const CLOSE_TAG = '</body></html>'

export type ContinueNodeStreamOptions = {
  inlinedDataStream: Readable | undefined
  isStaticGeneration: boolean
  allReady?: Promise<void>
  deploymentId: string | undefined
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  validateRootLayout?: boolean
  suffix?: string | undefined
}

export async function continueFizzStreamNode(
  renderStream: Readable,
  {
    suffix,
    inlinedDataStream,
    isStaticGeneration,
    allReady,
    deploymentId,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    validateRootLayout,
  }: ContinueNodeStreamOptions
): Promise<Readable> {
  const suffixUnclosed = suffix ? suffix.split(CLOSE_TAG, 1)[0] : null

  if (isStaticGeneration && allReady) {
    await allReady
  } else {
    // Wait for React to finish microtask work before consuming the stream,
    // matching the web streams behavior in continueFizzStream.
    await waitAtLeastOneReactRenderTask()
  }

  const result = chainNodeTransforms(renderStream, [
    createBufferedTransformNode(),
    deploymentId ? createHtmlDataDplIdTransformNode(deploymentId) : null,
    createMetadataTransformNode(getServerInsertedMetadata),
    suffixUnclosed != null && suffixUnclosed.length > 0
      ? createDeferredSuffixTransformNode(suffixUnclosed)
      : null,
    inlinedDataStream
      ? createFlightDataInjectionTransformNode(inlinedDataStream, true)
      : null,
    validateRootLayout ? createRootLayoutValidatorTransformNode() : null,
    createMoveSuffixTransformNode(),
    createHeadInsertionTransformNode(getServerInsertedHTML),
  ])

  return result
}

type ContinueDynamicPrerenderNodeOptions = {
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  deploymentId: string | undefined
}

export async function continueDynamicPrerenderNode(
  prerenderStream: Readable,
  {
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueDynamicPrerenderNodeOptions
): Promise<Readable> {
  return chainNodeTransforms(prerenderStream, [
    createBufferedTransformNode(),
    createStripDocumentClosingTagsTransformNode(),
    deploymentId ? createHtmlDataDplIdTransformNode(deploymentId) : null,
    createHeadInsertionTransformNode(getServerInsertedHTML),
    createMetadataTransformNode(getServerInsertedMetadata),
  ])
}

type ContinueStaticPrerenderNodeOptions = {
  inlinedDataStream: Readable
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  deploymentId: string | undefined
}

export async function continueStaticPrerenderNode(
  prerenderStream: Readable,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueStaticPrerenderNodeOptions
): Promise<Readable> {
  return chainNodeTransforms(prerenderStream, [
    createBufferedTransformNode(),
    deploymentId ? createHtmlDataDplIdTransformNode(deploymentId) : null,
    createHeadInsertionTransformNode(getServerInsertedHTML),
    createMetadataTransformNode(getServerInsertedMetadata),
    createFlightDataInjectionTransformNode(inlinedDataStream, true),
    createMoveSuffixTransformNode(),
  ])
}

export async function continueStaticFallbackPrerenderNode(
  prerenderStream: Readable,
  {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueStaticPrerenderNodeOptions
): Promise<Readable> {
  return chainNodeTransforms(prerenderStream, [
    createBufferedTransformNode(),
    deploymentId ? createHtmlDataDplIdTransformNode(deploymentId) : null,
    createHeadInsertionTransformNode(getServerInsertedHTML),
    createClientResumeScriptInsertionTransformNode(),
    createMetadataTransformNode(getServerInsertedMetadata),
    createFlightDataInjectionTransformNode(inlinedDataStream, true),
    createMoveSuffixTransformNode(),
  ])
}

type ContinueResumeNodeOptions = {
  inlinedDataStream: Readable
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
  delayDataUntilFirstHtmlChunk: boolean
  deploymentId: string | undefined
}

export async function continueDynamicHTMLResumeNode(
  renderStream: Readable,
  {
    delayDataUntilFirstHtmlChunk,
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: ContinueResumeNodeOptions
): Promise<Readable> {
  return chainNodeTransforms(renderStream, [
    createBufferedTransformNode(),
    deploymentId ? createHtmlDataDplIdTransformNode(deploymentId) : null,
    createHeadInsertionTransformNode(getServerInsertedHTML),
    createMetadataTransformNode(getServerInsertedMetadata),
    createFlightDataInjectionTransformNode(
      inlinedDataStream,
      delayDataUntilFirstHtmlChunk
    ),
    createMoveSuffixTransformNode(),
  ])
}

/**
 * Creates a Readable that emits the document closing tags.
 */
export function createDocumentClosingNodeStream(): Readable {
  return nodeStreamFromString(CLOSE_TAG)
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Converts a Node Readable to a web ReadableStream.
 * Thin wrapper around Node.js Readable.toWeb().
 */
export function nodeReadableToWeb(
  readable: Readable
): ReadableStream<Uint8Array> {
  const { Readable: NodeReadable } = getNodeStream()
  return NodeReadable.toWeb(readable) as ReadableStream<Uint8Array>
}

/**
 * Converts a web ReadableStream to a Node Readable.
 * Useful for instant-validation which expects Node Readables.
 */
export function nodeStreamFromReadableStream<T>(
  stream: ReadableStream<T>
): Readable {
  const reader = stream.getReader()
  const { Readable: NodeReadable } = getNodeStream()
  return new NodeReadable({
    read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            this.push(null)
          } else {
            this.push(value)
          }
        })
        .catch((err) => this.destroy(err))
    },
  })
}

// ---------------------------------------------------------------------------
// Runtime prefetch transform (Node.js)
// ---------------------------------------------------------------------------

/**
 * Node.js Transform that replaces the runtime prefetch sentinel in an RSC
 * payload stream: `[<sentinel>]` -> `[<isPartial>,<staleTime>]`.
 *
 * This is the Node.js equivalent of createRuntimePrefetchTransformStream
 * in node-web-streams-helper.ts.
 */
export function createRuntimePrefetchNodeTransform(
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): Transform {
  const { Transform: NodeTransform } = getNodeStream()
  const enc = new TextEncoder()

  const search = enc.encode(`[${sentinel}]`)
  const first = search[0]
  const replace = enc.encode(`[${isPartial},${staleTime}]`)
  const searchLen = search.length

  let currentChunk: Uint8Array | null = null
  let found = false

  function processChunk(
    transform: InstanceType<typeof NodeTransform>,
    nextChunk: null | Uint8Array
  ) {
    if (found) {
      if (nextChunk) {
        transform.push(nextChunk)
      }
      return
    }

    if (currentChunk) {
      let exclusiveUpperBound = currentChunk.length - (searchLen - 1)
      if (nextChunk) {
        exclusiveUpperBound += Math.min(nextChunk.length, searchLen - 1)
      }
      if (exclusiveUpperBound < 1) {
        transform.push(currentChunk)
        currentChunk = nextChunk
        return
      }

      let currentIndex = currentChunk.indexOf(first)

      candidateLoop: while (
        -1 < currentIndex &&
        currentIndex < exclusiveUpperBound
      ) {
        let matchIndex = 1
        while (matchIndex < searchLen) {
          const candidateIndex = currentIndex + matchIndex
          const candidateValue =
            candidateIndex < currentChunk.length
              ? currentChunk[candidateIndex]
              : nextChunk![candidateIndex - currentChunk.length]
          if (candidateValue !== search[matchIndex]) {
            currentIndex = currentChunk.indexOf(first, currentIndex + 1)
            continue candidateLoop
          }
          matchIndex++
        }
        found = true
        transform.push(currentChunk.subarray(0, currentIndex))
        transform.push(replace)
        if (currentIndex + searchLen < currentChunk.length) {
          transform.push(currentChunk.slice(currentIndex + searchLen))
        }
        if (nextChunk) {
          const overflowBytes = currentIndex + searchLen - currentChunk.length
          const truncatedChunk =
            overflowBytes > 0 ? nextChunk!.subarray(overflowBytes) : nextChunk
          transform.push(truncatedChunk)
        }
        currentChunk = null
        return
      }
      transform.push(currentChunk)
    }

    currentChunk = nextChunk
  }

  return new NodeTransform({
    transform(chunk: Uint8Array, _encoding, callback) {
      try {
        processChunk(this, chunk)
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
    flush(callback) {
      try {
        processChunk(this, null)
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}
