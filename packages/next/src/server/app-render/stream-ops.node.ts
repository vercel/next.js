/**
 * Node.js native stream operations for the rendering pipeline.
 *
 * When `experimental.useNodeStreams` is enabled, stream-ops.ts loads this
 * module instead of stream-ops.web.ts. Functions that can be cleanly
 * implemented with Node.js native streams are implemented here; complex
 * functions that rely on the web transform chain delegate to the web
 * implementation.
 *
 * Native implementations:
 *   - chainStreams       (via chainNodeStreams)
 *   - streamToBuffer     (via nodeStreamToBuffer)
 *   - streamToString     (via nodeStreamToString)
 *   - renderToFizzStream (via renderToPipeableStream)
 *   - nodeReadableToWeb  (Readable.toWeb)
 *
 * Delegates to web:
 *   - continueFizzStream, continueStaticPrerender, continueDynamicPrerender,
 *     continueStaticFallbackPrerender, continueDynamicHTMLResume
 *     (these use a chain of web TransformStreams for metadata/suffix/etc.)
 *   - resumeAndAbort, resumeToFizzStream (use react-dom/server.resume)
 *   - renderToFlightStream (RSC always produces web ReadableStream)
 *   - processPrelude (uses .tee()/.getReader())
 *   - pipeRuntimePrefetchTransform (web TransformStream)
 *
 * See: PR #91580 (node-stream-helpers), PR #89566 / #90500 (prior art).
 */

import type { Readable } from 'node:stream'
import type { PostponedState, PrerenderOptions } from 'react-dom/static'
import type { resume } from 'react-dom/server'
import { prerender } from 'react-dom/static'

import {
  chainNodeStreams,
  nodeStreamToBuffer,
  nodeStreamToString,
} from '../stream-utils/node-stream-helpers'

// Re-export the same types so stream-ops.ts can re-export them.
export type {
  AnyStream,
  ContinueFizzStreamOptions,
  ContinueStaticPrerenderOptions,
  ContinueDynamicHTMLResumeOptions,
  ContinueStreamSharedOptions,
  FlightComponentMod,
  ServerPrerenderComponentMod,
  FlightPayload,
  FlightClientModules,
  FlightRenderOptions,
  FizzStreamResult,
} from './stream-ops.web'

import type {
  AnyStream,
  ContinueFizzStreamOptions,
  FlightComponentMod,
  ServerPrerenderComponentMod,
  FlightPayload,
  FlightClientModules,
  FlightRenderOptions,
  FizzStreamResult,
} from './stream-ops.web'

// Lazy-require node:stream so this module is DCE-safe in edge bundles.
function getNodeStream(): typeof import('node:stream') {
  return require('node:stream') as typeof import('node:stream')
}

// ---------------------------------------------------------------------------
// Web <-> Node conversion helpers
// ---------------------------------------------------------------------------

function webToNode(web: ReadableStream<Uint8Array>): Readable {
  const { Readable: NodeReadable } = getNodeStream()
  return NodeReadable.fromWeb(web as any)
}

function nodeToWeb(node: Readable): ReadableStream<Uint8Array> {
  const { Readable: NodeReadable } = getNodeStream()
  return NodeReadable.toWeb(node) as ReadableStream<Uint8Array>
}

// ---------------------------------------------------------------------------
// nodeReadableToWeb — available in node bundles
// ---------------------------------------------------------------------------

export function nodeReadableToWeb(
  readable: Readable
): ReadableStream<Uint8Array> {
  return nodeToWeb(readable)
}

// ---------------------------------------------------------------------------
// Delegates — functions that use the web transform chain internally.
// These are re-exported from the web helpers unchanged.
// ---------------------------------------------------------------------------

export {
  continueStaticPrerender,
  continueDynamicPrerender,
  continueStaticFallbackPrerender,
  continueDynamicHTMLResume,
  createDocumentClosingStream,
} from '../stream-utils/node-web-streams-helper'

export { processPrelude } from './app-render-prerender-utils'

// continueFizzStream delegates to the web implementation since it uses
// a chain of ~8 web TransformStreams for metadata, suffix, head insertion,
// etc. Making these native is a follow-up.
export { continueFizzStream } from './stream-ops.web'

// ---------------------------------------------------------------------------
// chainStreams — NATIVE
// ---------------------------------------------------------------------------

export function chainStreams(
  ...streams: ReadableStream<Uint8Array>[]
): ReadableStream<Uint8Array> {
  if (streams.length === 0) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
  }
  if (streams.length === 1) {
    return streams[0]
  }
  const nodeStreams = streams.map(webToNode)
  return nodeToWeb(chainNodeStreams(...nodeStreams))
}

// ---------------------------------------------------------------------------
// streamToBuffer — NATIVE
// ---------------------------------------------------------------------------

export async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  return nodeStreamToBuffer(webToNode(stream))
}

// ---------------------------------------------------------------------------
// streamToString — NATIVE
// ---------------------------------------------------------------------------

export async function streamToString(stream: AnyStream): Promise<string> {
  return nodeStreamToString(
    webToNode(stream as ReadableStream<Uint8Array>)
  )
}

// ---------------------------------------------------------------------------
// createInlinedDataStream — delegates to web (script tag encoding)
// ---------------------------------------------------------------------------

export function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  const {
    createInlinedDataReadableStream,
  } = require('./use-flight-response') as typeof import('./use-flight-response')
  return createInlinedDataReadableStream(
    source as ReadableStream<Uint8Array>,
    nonce,
    formState
  )
}

// ---------------------------------------------------------------------------
// createPendingStream
// ---------------------------------------------------------------------------

export function createPendingStream(): AnyStream {
  return new ReadableStream<Uint8Array>()
}

// ---------------------------------------------------------------------------
// createOnHeadersCallback — same as web (no stream dependency)
// ---------------------------------------------------------------------------

export function createOnHeadersCallback(
  appendHeader: (key: string, value: string) => void
): NonNullable<PrerenderOptions['onHeaders']> {
  return (headers: Headers) => {
    headers.forEach((value, key) => {
      appendHeader(key, value)
    })
  }
}

// ---------------------------------------------------------------------------
// resumeAndAbort — delegates to web (resume produces web streams)
// ---------------------------------------------------------------------------

export async function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: Parameters<typeof resume>[2] & { nonce?: string }
): Promise<AnyStream> {
  const {
    resume: doResume,
  } = require('react-dom/server') as typeof import('react-dom/server')
  return doResume(
    element,
    postponed as PostponedState,
    opts as Parameters<typeof resume>[2]
  )
}

// ---------------------------------------------------------------------------
// renderToFlightStream — delegates (RSC always produces web ReadableStream)
// ---------------------------------------------------------------------------

export function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: FlightPayload,
  clientModules: FlightClientModules,
  opts: FlightRenderOptions
): AnyStream {
  return ComponentMod.renderToReadableStream(payload, clientModules, opts)
}

// ---------------------------------------------------------------------------
// renderToFizzStream — NATIVE via renderToPipeableStream
//
// Uses React's renderToPipeableStream which produces a Node.js pipeable
// stream, avoiding the web ReadableStream creation overhead in React.
// The pipeable stream is piped into a PassThrough and then converted to
// a web ReadableStream at the boundary for compatibility with the rest
// of the pipeline.
// ---------------------------------------------------------------------------

export async function renderToFizzStream(
  element: React.ReactElement,
  streamOptions: any
): Promise<FizzStreamResult> {
  const { renderToPipeableStream } = require('react-dom/server') as {
    renderToPipeableStream: (
      element: React.ReactElement,
      options?: any
    ) => { pipe: (dest: any) => any; abort: (reason?: unknown) => void }
  }
  const { PassThrough } = getNodeStream()

  return new Promise<FizzStreamResult>((resolve, reject) => {
    let didError = false
    const passthrough = new PassThrough()

    // allReady resolves when all Suspense boundaries are settled.
    // We create it outside the renderToPipeableStream call so the
    // reference is available to capture in the onShellReady closure.
    let resolveAllReady: () => void
    const allReady = new Promise<void>((r) => {
      resolveAllReady = r
    })

    const { pipe, abort } = renderToPipeableStream(element, {
      ...streamOptions,
      onShellReady() {
        streamOptions?.onShellReady?.()
        pipe(passthrough)
        const webStream = nodeToWeb(passthrough)
        resolve({
          stream: webStream,
          allReady,
          abort,
        })
      },
      onAllReady() {
        streamOptions?.onAllReady?.()
        resolveAllReady!()
      },
      onShellError(error: unknown) {
        streamOptions?.onShellError?.(error)
        didError = true
        reject(error)
      },
      onError(error: unknown) {
        streamOptions?.onError?.(error)
        if (!didError) {
          didError = true
        }
      },
    })
  })
}

// ---------------------------------------------------------------------------
// resumeToFizzStream — delegates to web (resume produces web streams)
// ---------------------------------------------------------------------------

export async function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any
): Promise<FizzStreamResult> {
  const {
    resume: doResume,
  } = require('react-dom/server') as typeof import('react-dom/server')
  const stream = await doResume(element, postponedState, streamOptions)
  return { stream, allReady: stream.allReady, abort: undefined }
}

// ---------------------------------------------------------------------------
// getServerPrerender / getClientPrerender — no stream dependency
// ---------------------------------------------------------------------------

export function getServerPrerender(
  ComponentMod: ServerPrerenderComponentMod
): (...args: any[]) => any {
  return ComponentMod.prerender
}

export const getClientPrerender: typeof import('react-dom/static').prerender =
  prerender

// ---------------------------------------------------------------------------
// pipeRuntimePrefetchTransform — delegates to web transform
// ---------------------------------------------------------------------------

export function pipeRuntimePrefetchTransform(
  stream: AnyStream,
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): AnyStream {
  const {
    createRuntimePrefetchTransformStream,
  } = require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
  return (stream as ReadableStream<Uint8Array>).pipeThrough(
    createRuntimePrefetchTransformStream(sentinel, isPartial, staleTime)
  )
}
