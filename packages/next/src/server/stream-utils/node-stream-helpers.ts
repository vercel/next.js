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
  let bufferedChunks: Uint8Array[] = []
  let bufferByteLength = 0
  let pending: DetachedPromise<void> | undefined
  const { Transform: T } = getNodeStream()

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
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
    const total = new Uint8Array(bufferByteLength)
    let offset = 0
    for (const chunk of bufferedChunks) {
      total.set(chunk, offset)
      offset += chunk.byteLength
    }
    bufferedChunks.length = 0
    bufferByteLength = 0
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

      const htmlTagIndex = indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.HTML)
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

      let iconMarkIndex = indexOfUint8Array(chunk, ENCODED_TAGS.META.ICON_MARK)
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
          const closedHeadIndex = indexOfUint8Array(
            chunk,
            ENCODED_TAGS.CLOSED.HEAD
          )
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

  return new T({
    transform(chunk: Uint8Array, _encoding, callback) {
      this.push(chunk)

      if (flushed) return callback()

      flushed = true
      const deferred = new DetachedPromise<void>()
      pendingPromise = deferred.promise

      scheduleImmediate(() => {
        try {
          this.push(encoder.encode(suffix))
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
        this.push(encoder.encode(suffix))
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
        dest.push(value)
      }
    } catch (err) {
      dest.destroy(err as Error)
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

      const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML)
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

      const headClosingTagIndex = indexOfUint8Array(
        chunk,
        ENCODED_TAGS.CLOSED.HEAD
      )
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

  return chainNodeTransforms(renderStream, [
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
