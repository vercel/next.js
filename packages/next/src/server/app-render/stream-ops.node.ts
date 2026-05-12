/**
 * Node.js stream operations for the rendering pipeline.
 * Loaded by stream-ops.ts when process.env.__NEXT_USE_NODE_STREAMS is true.
 *
 * AnyStream = AnyStreamType so the exported type surface matches stream-ops.web.ts,
 * allowing the switcher to assign either module without casts.
 * Rendering uses pipeable APIs; continue functions wrap the existing web
 * transforms via Readable.fromWeb() on their output.
 */

import type { PostponedState, PrerenderOptions } from 'react-dom/static'
import {
  renderToPipeableStream,
  resumeToPipeableStream,
} from 'react-dom/server'
import { prerender } from 'react-dom/static'
import { PassThrough, Readable, Transform } from 'node:stream'
import { isUtf8 } from 'node:buffer'

import {
  continueStaticPrerender as webContinueStaticPrerender,
  continueDynamicPrerender as webContinueDynamicPrerender,
  continueStaticFallbackPrerender as webContinueStaticFallbackPrerender,
  continueDynamicHTMLResume as webContinueDynamicHTMLResume,
  streamToBuffer as webStreamToBuffer,
  streamToString as webStreamToString,
  createDocumentClosingStream as webCreateDocumentClosingStream,
  createRuntimePrefetchTransformStream,
  CLOSE_TAG,
} from '../stream-utils/node-web-streams-helper'
import { indexOfUint8Array } from '../stream-utils/uint8array-helpers'
import { ENCODED_TAGS } from '../stream-utils/encoded-tags'
import { MISSING_ROOT_TAGS_ERROR } from '../../shared/lib/errors/constants'
import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../../shared/lib/htmlescape'
import { createInlinedDataReadableStream } from './use-flight-response'
import type { AnyStream as AnyStreamType } from './app-render-prerender-utils'
import { DetachedPromise } from '../../lib/detached-promise'
import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'
import {
  atLeastOneTask,
  waitAtLeastOneReactRenderTask,
} from '../../lib/scheduler'

// ---------------------------------------------------------------------------
// Re-export shared types from the web module
// ---------------------------------------------------------------------------

export type {
  ContinueStreamSharedOptions,
  ContinueFizzStreamOptions,
  ContinueStaticPrerenderOptions,
  ContinueDynamicHTMLResumeOptions,
  ServerPrerenderComponentMod,
  FlightPayload,
  FlightClientModules,
  FlightRenderOptions,
} from './stream-ops.web'

// ---------------------------------------------------------------------------
// AnyStream matches stream-ops.web.ts so both modules have the same type surface
// ---------------------------------------------------------------------------

export type AnyStream = AnyStreamType

export type FlightComponentMod = {
  renderToReadableStream: (
    model: any,
    webpackMap: any,
    options?: any
  ) => ReadableStream<Uint8Array>
  renderToPipeableStream?: (
    model: any,
    webpackMap: any,
    options?: any
  ) => {
    pipe<Writable extends NodeJS.WritableStream>(
      destination: Writable
    ): Writable
    abort(reason?: unknown): void
  }
}

export type FizzStreamResult = {
  stream: AnyStream
  allReady: Promise<void>
  abort?: (reason?: unknown) => void
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type WebReadableStream = import('stream/web').ReadableStream

function nodeReadableToWebReadableStream(
  stream: Readable | ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  if (stream instanceof ReadableStream) {
    return stream
  }
  // Readable.toWeb returns stream/web ReadableStream which is structurally
  // identical to the global ReadableStream<Uint8Array>.
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>
}

function webToReadable(
  stream: ReadableStream<Uint8Array> | Readable
): Readable {
  if (stream instanceof Readable) {
    return stream
  }
  return Readable.fromWeb(stream as WebReadableStream)
}

// ---------------------------------------------------------------------------
// Buffered transform – Node.js Transform that coalesces chunks written in the
// same microtask into a single Uint8Array before pushing downstream.
// ---------------------------------------------------------------------------

function createBufferedTransformStream(): Transform {
  let bufferedChunks: Array<Uint8Array> = []
  let bufferByteLength = 0
  let flushScheduled = false

  function flushBuffered(stream: Transform): void {
    if (bufferedChunks.length === 0) return

    const merged = new Uint8Array(bufferByteLength)
    let copiedBytes = 0
    for (let i = 0; i < bufferedChunks.length; i++) {
      const bufferedChunk = bufferedChunks[i]
      merged.set(bufferedChunk, copiedBytes)
      copiedBytes += bufferedChunk.byteLength
    }
    bufferedChunks.length = 0
    bufferByteLength = 0
    stream.push(merged)
  }

  return new Transform({
    transform(chunk, _encoding, callback) {
      bufferedChunks.push(chunk)
      bufferByteLength += chunk.byteLength

      if (!flushScheduled) {
        flushScheduled = true
        queueMicrotask(() => {
          flushScheduled = false
          flushBuffered(this)
        })
      }
      callback()
    },
    flush(callback) {
      flushBuffered(this)
      callback()
    },
  })
}

// ---------------------------------------------------------------------------
// Flight data injection – Node.js Transform that passes HTML chunks through
// while pulling from a separate data stream and interleaving its chunks.
// ---------------------------------------------------------------------------

function createFlightDataInjectionTransform(
  dataStream: Readable,
  delayDataUntilFirstHtmlChunk: boolean
): Transform {
  let htmlStreamFinished = false
  let pull: Promise<void> | null = null
  let donePulling = false

  function startOrContinuePulling(target: Transform) {
    if (!pull) {
      pull = startPulling(target)
    }
    return pull
  }

  async function startPulling(target: Transform) {
    if (delayDataUntilFirstHtmlChunk) {
      // Buffer the inlined data stream until we've left the current Task so
      // it's inserted after flushing the shell.
      await atLeastOneTask()
    }

    try {
      const iterator = dataStream[Symbol.asyncIterator]()
      while (true) {
        const { done, value } = await iterator.next()
        if (done) {
          donePulling = true
          return
        }

        // Prioritize HTML over RSC data: the SSR render produces HTML from
        // the same RSC stream, so yield a task to let HTML flush first.
        if (!delayDataUntilFirstHtmlChunk && !htmlStreamFinished) {
          await atLeastOneTask()
        }
        target.push(value)
      }
    } catch (err) {
      target.destroy(err as Error)
    }
  }

  const nodeTransform = new Transform({
    transform(chunk, _encoding, callback) {
      this.push(chunk)
      if (delayDataUntilFirstHtmlChunk) {
        startOrContinuePulling(this)
      }
      callback()
    },
    flush(callback) {
      htmlStreamFinished = true
      if (donePulling) {
        callback()
        return
      }
      startOrContinuePulling(this).then(
        () => callback(),
        (err) => callback(err as Error)
      )
    },
  })

  if (!delayDataUntilFirstHtmlChunk) {
    startOrContinuePulling(nodeTransform)
  }

  return nodeTransform
}

// ---------------------------------------------------------------------------
// Head insertion – Node.js Transform that inserts server-generated HTML
// (e.g. <script>, <style>) right before </head>, or prepends it if no
// </head> tag is found (PPR resume case).
// ---------------------------------------------------------------------------

function createHeadInsertionTransform(
  insert: () => Promise<string>
): Transform {
  let inserted = false
  let hasBytes = false

  return new Transform({
    async transform(chunk, _encoding, callback) {
      hasBytes = true

      try {
        const insertion = await insert()
        if (inserted) {
          if (insertion) {
            this.push(Buffer.from(insertion))
          }
          this.push(chunk)
        } else {
          const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
          if (index !== -1) {
            if (insertion) {
              const encodedInsertion = Buffer.from(insertion)
              const merged = Buffer.allocUnsafe(
                chunk.length + encodedInsertion.length
              )
              merged.set(chunk.slice(0, index))
              merged.set(encodedInsertion, index)
              merged.set(chunk.slice(index), index + encodedInsertion.length)
              this.push(merged)
            } else {
              this.push(chunk)
            }
            inserted = true
          } else {
            if (insertion) {
              this.push(Buffer.from(insertion))
            }
            this.push(chunk)
            inserted = true
          }
        }
        callback()
      } catch (err) {
        callback(err as Error)
      }
    },
    async flush(callback) {
      try {
        if (hasBytes) {
          const insertion = await insert()
          if (insertion) {
            this.push(Buffer.from(insertion))
          }
        }
        callback()
      } catch (err) {
        callback(err as Error)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Metadata transform – Node.js Transform that finds the «nxt-icon» meta mark
// and replaces it with a script tag (or removes it if inside <head>).
// ---------------------------------------------------------------------------

function createMetadataTransform(
  insert: () => Promise<string> | string
): Transform {
  let chunkIndex = -1
  let isMarkRemoved = false

  return new Transform({
    async transform(chunk, _encoding, callback) {
      let iconMarkIndex = -1
      let closedHeadIndex = -1
      chunkIndex++

      if (isMarkRemoved) {
        this.push(chunk)
        callback()
        return
      }

      try {
        let iconMarkLength = 0
        iconMarkIndex = indexOfUint8Array(chunk, ENCODED_TAGS.META.ICON_MARK)
        if (iconMarkIndex === -1) {
          this.push(chunk)
          callback()
          return
        }

        iconMarkLength = ENCODED_TAGS.META.ICON_MARK.length
        if (chunk[iconMarkIndex + iconMarkLength] === 47) {
          iconMarkLength += 2
        } else {
          iconMarkLength++
        }

        if (chunkIndex === 0) {
          closedHeadIndex = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.HEAD)
          if (iconMarkIndex < closedHeadIndex) {
            const replaced = Buffer.allocUnsafe(chunk.length - iconMarkLength)
            replaced.set(chunk.subarray(0, iconMarkIndex))
            replaced.set(
              chunk.subarray(iconMarkIndex + iconMarkLength),
              iconMarkIndex
            )
            chunk = replaced
          } else {
            const insertion = await insert()
            const encodedInsertion = Buffer.from(insertion)
            const insertionLength = encodedInsertion.length
            const replaced = Buffer.allocUnsafe(
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
        } else {
          const insertion = await insert()
          const encodedInsertion = Buffer.from(insertion)
          const insertionLength = encodedInsertion.length
          const replaced = Buffer.allocUnsafe(
            chunk.length - iconMarkLength + insertionLength
          )
          replaced.set(chunk.subarray(0, iconMarkIndex))
          replaced.set(encodedInsertion, iconMarkIndex)
          replaced.set(
            chunk.subarray(iconMarkIndex + iconMarkLength),
            iconMarkIndex + insertionLength
          )
          chunk = replaced
          isMarkRemoved = true
        }
        this.push(chunk)
        callback()
      } catch (err) {
        callback(err as Error)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Deferred suffix – Node.js Transform that appends a suffix string after the
// first HTML chunk, deferring via queueMicrotask so the chunk flushes first.
// ---------------------------------------------------------------------------

function createDeferredSuffixTransform(suffix: string): Transform {
  let flushed = false
  const encodedSuffix = Buffer.from(suffix)

  return new Transform({
    transform(chunk, _encoding, callback) {
      this.push(chunk)

      if (!flushed) {
        flushed = true
        queueMicrotask(() => {
          this.push(encodedSuffix)
        })
      }
      callback()
    },
    flush(callback) {
      if (!flushed) {
        this.push(encodedSuffix)
      }
      callback()
    },
  })
}

// ---------------------------------------------------------------------------
// Move suffix – Node.js Transform that strips </body></html> from its
// original position and re-appends it at the very end of the stream, so any
// content injected after the suffix still appears before the closing tags.
// ---------------------------------------------------------------------------

function createMoveSuffixTransform(): Transform {
  let foundSuffix = false

  return new Transform({
    transform(chunk, _encoding, callback) {
      if (foundSuffix) {
        this.push(chunk)
        callback()
        return
      }

      const index = indexOfUint8Array(chunk, ENCODED_TAGS.CLOSED.BODY_AND_HTML)
      if (index > -1) {
        foundSuffix = true

        if (chunk.length === ENCODED_TAGS.CLOSED.BODY_AND_HTML.length) {
          callback()
          return
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

// ---------------------------------------------------------------------------
// data-dpl-id insertion – Node.js Transform that inserts a `data-dpl-id`
// attribute on the opening <html tag for deployment identification.
// ---------------------------------------------------------------------------

function createHtmlDataDplIdTransform(dplId: string): Transform {
  let didTransform = false

  return new Transform({
    transform(chunk, _encoding, callback) {
      if (didTransform) {
        this.push(chunk)
        callback()
        return
      }

      const htmlTagIndex = indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.HTML)
      if (htmlTagIndex === -1) {
        this.push(chunk)
        callback()
        return
      }

      const insertionPoint = htmlTagIndex + ENCODED_TAGS.OPENING.HTML.length
      const encodedAttribute = Buffer.from(` data-dpl-id="${dplId}"`)
      const modified = Buffer.allocUnsafe(
        chunk.length + encodedAttribute.length
      )

      modified.set(chunk.subarray(0, insertionPoint))
      modified.set(encodedAttribute, insertionPoint)
      modified.set(
        chunk.subarray(insertionPoint),
        insertionPoint + encodedAttribute.length
      )

      this.push(modified)
      didTransform = true
      callback()
    },
  })
}

// ---------------------------------------------------------------------------
// Root layout validator – Node.js Transform that checks whether <html> and
// <body> tags are present in the streamed output.  Dev-only; appends an
// error template when tags are missing so the error overlay can display it.
// ---------------------------------------------------------------------------

function createRootLayoutValidatorTransform(): Transform {
  let foundHtml = false
  let foundBody = false

  return new Transform({
    transform(chunk, _encoding, callback) {
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
          Buffer.from(
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

// ---------------------------------------------------------------------------
// Rendering functions (output Node Readable natively via PassThrough)
// ---------------------------------------------------------------------------

export { renderToWebFlightStream } from './stream-ops.web'

export function renderToNodeFlightStream(
  ComponentMod: FlightComponentMod,
  payload: any,
  clientModules: any,
  opts: any
): AnyStream {
  if (!ComponentMod.renderToPipeableStream) {
    throw new Error('renderToPipeableStream is not implemented')
  }

  const pt = new PassThrough()
  const pipeable = ComponentMod.renderToPipeableStream!(
    payload,
    clientModules,
    opts
  )
  pipeable.pipe(pt)
  return pt
}

export { renderToWebFizzStream } from './stream-ops.web'

export async function renderToNodeFizzStream(
  element: React.ReactElement,
  streamOptions: any,
  options?: { waitForAllReady?: boolean }
): Promise<FizzStreamResult> {
  const pt = new PassThrough()
  const shellReady = new DetachedPromise<void>()
  const allReady = new DetachedPromise<void>()
  const deferPipe = options?.waitForAllReady === true

  const pipeable = getTracer().trace(AppRenderSpan.renderToReadableStream, () =>
    renderToPipeableStream(element, {
      ...streamOptions,
      onHeaders: streamOptions?.onHeaders,
      onShellReady() {
        streamOptions?.onShellReady?.()
        if (!deferPipe) {
          pipeable.pipe(pt)
        }
        shellReady.resolve()
      },
      onShellError(error: unknown) {
        streamOptions?.onShellError?.(error)
        shellReady.reject(error)
      },
      onAllReady() {
        streamOptions?.onAllReady?.()
        if (deferPipe) {
          pipeable.pipe(pt)
        }
        allReady.resolve()
      },
      onError: streamOptions?.onError,
    })
  )

  await shellReady.promise

  return {
    stream: pt,
    allReady: allReady.promise,
    abort: (reason?: unknown) => pipeable.abort(reason),
  }
}

export async function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult> {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())

  const pt = new PassThrough()
  const allReady = new DetachedPromise<void>()

  const pipeable = await run(() =>
    resumeToPipeableStream(element, postponedState, {
      ...streamOptions,
      onAllReady() {
        streamOptions?.onAllReady?.()
        allReady.resolve()
      },
    })
  )
  pipeable.pipe(pt)

  return {
    stream: pt,
    allReady: allReady.promise,
    abort: (reason?: unknown) => pipeable.abort(reason),
  }
}

export async function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: any
): Promise<AnyStream> {
  const pt = new PassThrough()
  const pipeable = await resumeToPipeableStream(
    element,
    postponed as PostponedState,
    opts
  )
  pipeable.pipe(pt)
  pipeable.abort(opts?.signal?.reason)
  return pt
}

// ---------------------------------------------------------------------------
// Continue function wrappers
// Bridge Node Readable → web, apply existing web transforms, Readable.fromWeb()
// ---------------------------------------------------------------------------

export async function continueFizzStream(
  renderStream: AnyStream,
  {
    suffix,
    inlinedDataStream,
    isStaticGeneration,
    allReady,
    deploymentId,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    validateRootLayout,
  }: import('./stream-ops.web').ContinueFizzStreamOptions
): Promise<Readable> {
  // Suffix itself might contain close tags at the end, so we need to split it.
  const suffixUnclosed = suffix ? suffix.split(CLOSE_TAG, 1)[0] : null

  if (isStaticGeneration) {
    if (allReady) {
      await allReady
    }
  } else {
    // Otherwise, we want to make sure Fizz is done with all microtasky work
    // before we start pulling the stream and cause a flush.
    await waitAtLeastOneReactRenderTask()
  }

  // Pipe the render stream through Node.js Transforms:
  // 1. Buffer – coalesces chunks written in the same microtask into one Uint8Array
  // 2. Flight data injection – interleaves RSC data chunks with the HTML stream
  // 3. Head insertion – inserts server-generated HTML before </head>
  const buffered = createBufferedTransformStream()
  webToReadable(renderStream).pipe(buffered)

  let source: Readable = buffered

  if (deploymentId) {
    const dplId = createHtmlDataDplIdTransform(deploymentId)
    source.pipe(dplId)
    source = dplId
  }

  // Metadata (icon mark replacement)
  const metadata = createMetadataTransform(getServerInsertedMetadata)
  source.pipe(metadata)
  source = metadata

  // Insert suffix content
  if (suffixUnclosed != null && suffixUnclosed.length > 0) {
    const deferredSuffix = createDeferredSuffixTransform(suffixUnclosed)
    source.pipe(deferredSuffix)
    source = deferredSuffix
  }

  // Flight data injection – interleaves RSC data chunks with the HTML stream
  if (inlinedDataStream) {
    const flightInjection = createFlightDataInjectionTransform(
      webToReadable(inlinedDataStream),
      true
    )
    source.pipe(flightInjection)
    source = flightInjection
  }

  if (validateRootLayout) {
    const rootLayoutValidator = createRootLayoutValidatorTransform()
    source.pipe(rootLayoutValidator)
    source = rootLayoutValidator
  }

  // Close tags should always be deferred to the end
  const moveSuffix = createMoveSuffixTransform()
  source.pipe(moveSuffix)
  source = moveSuffix

  // Head insertion – inserts server-generated HTML before </head>
  const headInsertion = createHeadInsertionTransform(getServerInsertedHTML)
  source.pipe(headInsertion)
  source = headInsertion

  return source
}

export async function continueStaticPrerender(
  prerenderStream: AnyStream,
  opts: import('./stream-ops.web').ContinueStaticPrerenderOptions
): Promise<AnyStream> {
  const webResult = await webContinueStaticPrerender(
    nodeReadableToWebReadableStream(prerenderStream),
    {
      ...opts,
      inlinedDataStream: nodeReadableToWebReadableStream(
        opts.inlinedDataStream
      ),
    }
  )
  return webToReadable(webResult)
}

export async function continueDynamicPrerender(
  prerenderStream: AnyStream,
  opts: {
    getServerInsertedHTML: () => Promise<string>
    getServerInsertedMetadata: () => Promise<string>
    deploymentId: string | undefined
  }
): Promise<AnyStream> {
  const webResult = await webContinueDynamicPrerender(
    nodeReadableToWebReadableStream(prerenderStream),
    opts
  )
  return webToReadable(webResult)
}

export async function continueStaticFallbackPrerender(
  prerenderStream: AnyStream,
  opts: import('./stream-ops.web').ContinueStaticPrerenderOptions
): Promise<AnyStream> {
  const webResult = await webContinueStaticFallbackPrerender(
    nodeReadableToWebReadableStream(prerenderStream),
    {
      ...opts,
      inlinedDataStream: nodeReadableToWebReadableStream(
        opts.inlinedDataStream
      ),
    }
  )
  return webToReadable(webResult)
}

export async function continueDynamicHTMLResumeNode(
  renderStream: AnyStream,
  {
    delayDataUntilFirstHtmlChunk,
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  }: import('./stream-ops.web').ContinueDynamicHTMLResumeOptions
): Promise<AnyStream> {
  await waitAtLeastOneReactRenderTask()

  const buffered = createBufferedTransformStream()
  webToReadable(renderStream).pipe(buffered)

  let source: Readable = buffered

  if (deploymentId) {
    const dplId = createHtmlDataDplIdTransform(deploymentId)
    source.pipe(dplId)
    source = dplId
  }

  const headInsertion = createHeadInsertionTransform(getServerInsertedHTML)
  source.pipe(headInsertion)
  source = headInsertion

  const metadata = createMetadataTransform(getServerInsertedMetadata)
  source.pipe(metadata)
  source = metadata

  const flightInjection = createFlightDataInjectionTransform(
    webToReadable(inlinedDataStream),
    delayDataUntilFirstHtmlChunk
  )
  source.pipe(flightInjection)
  source = flightInjection

  const moveSuffix = createMoveSuffixTransform()
  source.pipe(moveSuffix)
  source = moveSuffix

  return source
}

export async function continueDynamicHTMLResumeWeb(
  renderStream: AnyStream,
  opts: import('./stream-ops.web').ContinueDynamicHTMLResumeOptions
): Promise<AnyStream> {
  const webResult = await webContinueDynamicHTMLResume(
    nodeReadableToWebReadableStream(renderStream),
    {
      ...opts,
      inlinedDataStream: nodeReadableToWebReadableStream(
        opts.inlinedDataStream
      ),
    }
  )
  return webToReadable(webResult)
}

// ---------------------------------------------------------------------------
// Utility functions (Node-native)
// ---------------------------------------------------------------------------

export function chainStreams(...streams: AnyStream[]): AnyStream {
  if (streams.length === 0) {
    const pt = new PassThrough()
    pt.end()
    return pt
  }

  if (streams.length === 1) {
    return streams[0]
  }

  const out = new PassThrough()
  let i = 0

  function pipeNext() {
    if (i >= streams.length) {
      out.end()
      return
    }
    const current = webToReadable(streams[i++])
    current.pipe(out, { end: false })
    current.on('end', pipeNext)
    current.on('error', (err) => out.destroy(err))
  }

  pipeNext()
  return out
}

export async function streamToBuffer(stream: AnyStream): Promise<Buffer> {
  return webStreamToBuffer(nodeReadableToWebReadableStream(stream))
}

export async function streamToString(stream: AnyStream): Promise<string> {
  return webStreamToString(nodeReadableToWebReadableStream(stream))
}

export function createWebInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  const webSource = nodeReadableToWebReadableStream(source)
  const webResult = createInlinedDataReadableStream(webSource, nonce, formState)
  return webToReadable(webResult)
}

export function createNodeInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  const startScriptTag = nonce
    ? `<script nonce="${htmlEscapeAttributeString(nonce)}">`
    : '<script>'

  const dataStream = webToReadable(source)
  const pt = new PassThrough()

  // Write initial bootstrap instructions
  let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
    JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
  )})`
  if (formState != null) {
    scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
    )})`
  }
  pt.push(Buffer.from(`${startScriptTag}${scriptContents}</script>`))

  // Pull from the flight data stream and wrap each chunk in a <script> tag
  pullFlightData(dataStream, pt, startScriptTag)

  return pt
}

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

async function pullFlightData(
  dataStream: Readable,
  output: PassThrough,
  startScriptTag: string
): Promise<void> {
  function waitForReadableOrEnd(): Promise<void> {
    if (dataStream.readableLength > 0 || dataStream.readableEnded) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      function cleanup() {
        dataStream.removeListener('readable', onDone)
        dataStream.removeListener('end', onDone)
        dataStream.removeListener('error', onError)
      }
      function onDone() {
        cleanup()
        resolve()
      }
      function onError(err: Error) {
        cleanup()
        reject(err)
      }
      dataStream.on('readable', onDone)
      dataStream.on('end', onDone)
      dataStream.on('error', onError)
    })
  }

  try {
    while (true) {
      const chunk: Buffer | null = dataStream.read()
      if (chunk !== null) {
        let htmlInlinedData: string
        if (isUtf8(chunk)) {
          const decodedString = chunk.toString('utf-8')
          htmlInlinedData = htmlEscapeJsonString(
            JSON.stringify([INLINE_FLIGHT_PAYLOAD_DATA, decodedString])
          )
        } else {
          const base64 = Buffer.from(
            chunk.buffer,
            chunk.byteOffset,
            chunk.byteLength
          ).toString('base64')
          htmlInlinedData = htmlEscapeJsonString(
            JSON.stringify([INLINE_FLIGHT_PAYLOAD_BINARY, base64])
          )
        }
        output.push(
          Buffer.from(
            `${startScriptTag}self.__next_f.push(${htmlInlinedData})</script>`
          )
        )
        continue
      }

      if (dataStream.readableEnded) {
        output.end()
        return
      }

      await waitForReadableOrEnd()
    }
  } catch (err) {
    output.destroy(err as Error)
  }
}

export function createPendingStream(): AnyStream {
  return new PassThrough()
}

export function createDocumentClosingStream(): AnyStream {
  const webStream = webCreateDocumentClosingStream()
  return webToReadable(webStream)
}

export function createOnHeadersCallback(
  appendHeader: (key: string, value: string) => void
): NonNullable<PrerenderOptions['onHeaders']> {
  return (headers: Headers) => {
    headers.forEach((value, key) => {
      appendHeader(key, value)
    })
  }
}

export function pipeRuntimePrefetchTransform(
  stream: AnyStream,
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): AnyStream {
  const webStream = nodeReadableToWebReadableStream(stream)
  const transformed = webStream.pipeThrough(
    createRuntimePrefetchTransformStream(sentinel, isPartial, staleTime)
  )
  return webToReadable(transformed)
}

// ---------------------------------------------------------------------------
// Re-exports (no stream involvement, identical to web)
// ---------------------------------------------------------------------------

export async function processPrelude(unprocessedPrelude: AnyStream) {
  const [prelude, peek] =
    nodeReadableToWebReadableStream(unprocessedPrelude).tee()

  const reader = peek.getReader()
  const firstResult = await reader.read()
  reader.cancel()

  return {
    prelude: webToReadable(prelude) as AnyStream,
    preludeIsEmpty: firstResult.done === true,
  }
}

export function getServerPrerender(ComponentMod: {
  prerender: (...args: any[]) => Promise<any>
}): (...args: any[]) => any {
  return ComponentMod.prerender
}

export const getClientPrerender: typeof import('react-dom/static').prerender =
  prerender

export function teeStream(stream: AnyStream): [AnyStream, AnyStream] {
  const [s1, s2] = nodeReadableToWebReadableStream(stream).tee()
  return [webToReadable(s1), webToReadable(s2)]
}
