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
import { PassThrough, Readable } from 'node:stream'

import type { ReactDOMServerReadableStream } from 'react-dom/server'
import {
  continueFizzStream as webContinueFizzStream,
  continueStaticPrerender as webContinueStaticPrerender,
  continueDynamicPrerender as webContinueDynamicPrerender,
  continueStaticFallbackPrerender as webContinueStaticFallbackPrerender,
  continueDynamicHTMLResume as webContinueDynamicHTMLResume,
  streamToBuffer as webStreamToBuffer,
  streamToString as webStreamToString,
  createDocumentClosingStream as webCreateDocumentClosingStream,
  createRuntimePrefetchTransformStream,
} from '../stream-utils/node-web-streams-helper'
import { createInlinedDataReadableStream } from './use-flight-response'
import type { AnyStream as AnyStreamType } from './app-render-prerender-utils'
import { DetachedPromise } from '../../lib/detached-promise'
import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'

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
// Rendering functions (output Node Readable natively via PassThrough)
// ---------------------------------------------------------------------------

export function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: any,
  clientModules: any,
  opts: any,
  runInContext?: <T>(fn: () => T) => T
): AnyStream {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())

  if (ComponentMod.renderToPipeableStream) {
    const pt = new PassThrough()
    const pipeable = run(() =>
      ComponentMod.renderToPipeableStream!(payload, clientModules, opts)
    )
    pipeable.pipe(pt)
    return pt
  }

  // Fallback: use web API and convert
  const webStream = run(() =>
    ComponentMod.renderToReadableStream(payload, clientModules, opts)
  )
  return webToReadable(webStream)
}

export async function renderToFizzStream(
  element: React.ReactElement,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult> {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())

  const pt = new PassThrough()
  const shellReady = new DetachedPromise<void>()
  const allReady = new DetachedPromise<void>()

  // Node.js renderToPipeableStream passes a plain object to onHeaders,
  // but callers expect a web Headers instance.
  const originalOnHeaders = streamOptions?.onHeaders
  const wrappedOnHeaders = originalOnHeaders
    ? (headers: Record<string, string>) => {
        originalOnHeaders(new Headers(headers))
      }
    : undefined

  const pipeable = run(() =>
    getTracer().trace(AppRenderSpan.renderToReadableStream, () =>
      renderToPipeableStream(element, {
        ...streamOptions,
        onHeaders: wrappedOnHeaders,
        onShellReady() {
          streamOptions?.onShellReady?.()
          pipeable.pipe(pt)
          shellReady.resolve()
        },
        onShellError(error: unknown) {
          streamOptions?.onShellError?.(error)
          shellReady.reject(error)
        },
        onAllReady() {
          streamOptions?.onAllReady?.()
          allReady.resolve()
        },
        onError: streamOptions?.onError,
      })
    )
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
  opts: import('./stream-ops.web').ContinueFizzStreamOptions
): Promise<AnyStream> {
  const webOpts = {
    ...opts,
    inlinedDataStream: opts.inlinedDataStream
      ? nodeReadableToWebReadableStream(opts.inlinedDataStream)
      : undefined,
  }
  // The web continueFizzStream reads renderStream.allReady from the stream
  // object itself (ReactDOMServerReadableStream). A plain ReadableStream from
  // readableToWeb() won't have that property, so we attach it from opts.
  const webStream = nodeReadableToWebReadableStream(renderStream)
  const fizzLike = Object.assign(webStream, {
    allReady: opts.allReady ?? Promise.resolve(),
  }) as ReactDOMServerReadableStream
  const webResult = await webContinueFizzStream(fizzLike, webOpts)
  return webToReadable(webResult)
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

export async function continueDynamicHTMLResume(
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

export async function streamToUint8Array(
  stream: AnyStream
): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  for await (const chunk of webToReadable(stream)) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export async function streamToString(stream: AnyStream): Promise<string> {
  return webStreamToString(nodeReadableToWebReadableStream(stream))
}

export function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  const webSource = nodeReadableToWebReadableStream(source)
  const webResult = createInlinedDataReadableStream(webSource, nonce, formState)
  return webToReadable(webResult)
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
