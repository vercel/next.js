/**
 * Web stream operations for the rendering pipeline.
 * Loaded by stream-ops.js when __NEXT_USE_NODE_STREAMS is false/undefined.
 */

import type {
  AnyStream,
  ContinueFizzStreamOptions,
  ContinueStaticPrerenderOptions,
  ContinueStreamSharedOptions,
  ContinueDynamicHTMLResumeOptions,
  FlightComponentMod,
  ServerPrerenderComponentMod,
  FlightPayload,
  FlightClientModules,
  FlightRenderOptions,
} from './stream-ops.node'

// Re-export shared types so they're available to consumers
export type {
  AnyStream,
  ContinueFizzStreamOptions,
  ContinueStaticPrerenderOptions,
  ContinueStreamSharedOptions,
  ContinueDynamicHTMLResumeOptions,
  FlightComponentMod,
  ServerPrerenderComponentMod,
  FlightPayload,
  FlightClientModules,
  FlightRenderOptions,
}

import type { PostponedState, PrerenderOptions } from 'react-dom/static'
import { resume, renderToReadableStream } from 'react-dom/server'
import { prerender } from 'react-dom/static'

import {
  renderToInitialFizzStream,
  streamToString as webStreamToString,
  createRuntimePrefetchTransformStream,
} from '../stream-utils/node-web-streams-helper'
import { createInlinedDataReadableStream } from './use-flight-response'

// ---------------------------------------------------------------------------
// Continue functions
// ---------------------------------------------------------------------------

export {
  continueFizzStream,
  continueStaticPrerender,
  continueDynamicPrerender,
  continueStaticFallbackPrerender,
  continueDynamicHTMLResume,
  streamToBuffer,
  chainStreams,
  createDocumentClosingStream,
} from '../stream-utils/node-web-streams-helper'

export { processPrelude } from './app-render-prerender-utils'

// Not available in web bundles
export const nodeReadableToWeb:
  | ((readable: import('node:stream').Readable) => ReadableStream<Uint8Array>)
  | undefined = undefined

// ---------------------------------------------------------------------------
// Composed helpers
// ---------------------------------------------------------------------------

export function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  return createInlinedDataReadableStream(
    source as ReadableStream<Uint8Array>,
    nonce,
    formState
  )
}

export function createPendingStream(): AnyStream {
  return new ReadableStream<Uint8Array>()
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

export async function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: Parameters<typeof resume>[2] & { nonce?: string }
): Promise<AnyStream> {
  return resume(
    element,
    postponed as PostponedState,
    opts as Parameters<typeof resume>[2]
  )
}

export function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: FlightPayload,
  clientModules: FlightClientModules,
  opts: FlightRenderOptions,
  runInContext?: <T>(fn: () => T) => T
): AnyStream {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())
  return run(() =>
    ComponentMod.renderToReadableStream(payload, clientModules, opts)
  )
}

export async function streamToString(stream: AnyStream): Promise<string> {
  return webStreamToString(stream as ReadableStream<Uint8Array>)
}

export type FizzStreamResult = {
  stream: AnyStream
  allReady: Promise<void>
  abort?: (reason?: unknown) => void
}

export async function renderToFizzStream(
  element: React.ReactElement,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult> {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())
  const stream = await run(() =>
    renderToInitialFizzStream({
      ReactDOMServer: { renderToReadableStream },
      element,
      streamOptions,
    })
  )
  return { stream, allReady: stream.allReady, abort: undefined }
}

export async function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult> {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())
  const stream = await run(() => resume(element, postponedState, streamOptions))
  return { stream, allReady: stream.allReady, abort: undefined }
}

export function getServerPrerender(
  ComponentMod: ServerPrerenderComponentMod
): (...args: any[]) => any {
  return ComponentMod.prerender
}

export const getClientPrerender: typeof import('react-dom/static').prerender =
  prerender

export function pipeRuntimePrefetchTransform(
  stream: AnyStream,
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): AnyStream {
  return (stream as ReadableStream<Uint8Array>).pipeThrough(
    createRuntimePrefetchTransformStream(sentinel, isPartial, staleTime)
  )
}
