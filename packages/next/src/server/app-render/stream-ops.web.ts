/**
 * Web stream operations for the rendering pipeline.
 * Loaded by stream-ops.ts when __NEXT_USE_NODE_STREAMS is false (default).
 *
 * AnyStream = AnyStreamType so the exported type surface matches stream-ops.node.ts,
 * allowing the switcher to assign either module without `as unknown as`.
 */

import type { PostponedState, PrerenderOptions } from 'react-dom/static'
import { resume, renderToReadableStream } from 'react-dom/server'
import { prerender } from 'react-dom/static'

import {
  renderToInitialFizzStream,
  streamToString as webStreamToString,
  createRuntimePrefetchTransformStream,
  continueFizzStream as webContinueFizzStream,
  continueStaticPrerender as webContinueStaticPrerender,
  continueDynamicPrerender as webContinueDynamicPrerender,
  continueStaticFallbackPrerender as webContinueStaticFallbackPrerender,
  continueDynamicHTMLResume as webContinueDynamicHTMLResume,
  streamToBuffer as webStreamToBuffer,
  streamToUint8Array as webStreamToUint8Array,
  chainStreams as webChainStreams,
  createDocumentClosingStream as webCreateDocumentClosingStream,
} from '../stream-utils/node-web-streams-helper'
import { createInlinedDataReadableStream } from './use-flight-response'
import { processPrelude as webProcessPrelude } from './app-render-prerender-utils'
import type { AnyStream as AnyStreamType } from './app-render-prerender-utils'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type FlightRenderToReadableStream = (
  model: any,
  webpackMap: any,
  options?: any
) => ReadableStream<Uint8Array>

export type AnyStream = AnyStreamType

export type ContinueStreamSharedOptions = {
  deploymentId: string | undefined
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
}

export type ContinueFizzStreamOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream | undefined
  isStaticGeneration: boolean
  allReady?: Promise<void>
  validateRootLayout?: boolean
  suffix?: string
}

export type ContinueStaticPrerenderOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream
}

export type ContinueDynamicHTMLResumeOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream
  delayDataUntilFirstHtmlChunk: boolean
}

export type FlightComponentMod = {
  renderToReadableStream: FlightRenderToReadableStream
}

export type ServerPrerenderComponentMod = {
  prerender: (...args: any[]) => Promise<any>
}

export type FlightPayload = Parameters<FlightRenderToReadableStream>[0]
export type FlightClientModules = Parameters<FlightRenderToReadableStream>[1]
export type FlightRenderOptions = Parameters<FlightRenderToReadableStream>[2]

export type FizzStreamResult = {
  stream: AnyStream
  allReady: Promise<void>
  abort?: (reason?: unknown) => void
}

// ---------------------------------------------------------------------------
// Continue function wrappers
// Thin wrappers that accept AnyStream and narrow to
// ReadableStream<Uint8Array> internally for the web helper functions.
// ---------------------------------------------------------------------------

export function continueFizzStream(
  renderStream: AnyStream,
  opts: ContinueFizzStreamOptions
): Promise<AnyStream> {
  return webContinueFizzStream(
    renderStream as ReadableStream<Uint8Array> as any,
    {
      ...opts,
      inlinedDataStream: opts.inlinedDataStream as
        | ReadableStream<Uint8Array>
        | undefined,
    }
  )
}

export async function continueStaticPrerender(
  prerenderStream: AnyStream,
  opts: ContinueStaticPrerenderOptions
): Promise<AnyStream> {
  return webContinueStaticPrerender(
    prerenderStream as ReadableStream<Uint8Array>,
    {
      ...opts,
      inlinedDataStream: opts.inlinedDataStream as ReadableStream<Uint8Array>,
    }
  )
}

export async function continueDynamicPrerender(
  prerenderStream: AnyStream,
  opts: {
    getServerInsertedHTML: () => Promise<string>
    getServerInsertedMetadata: () => Promise<string>
    deploymentId: string | undefined
  }
): Promise<AnyStream> {
  return webContinueDynamicPrerender(
    prerenderStream as ReadableStream<Uint8Array>,
    opts
  )
}

export async function continueStaticFallbackPrerender(
  prerenderStream: AnyStream,
  opts: ContinueStaticPrerenderOptions
): Promise<AnyStream> {
  return webContinueStaticFallbackPrerender(
    prerenderStream as ReadableStream<Uint8Array>,
    {
      ...opts,
      inlinedDataStream: opts.inlinedDataStream as ReadableStream<Uint8Array>,
    }
  )
}

export async function continueDynamicHTMLResume(
  renderStream: AnyStream,
  opts: ContinueDynamicHTMLResumeOptions
): Promise<AnyStream> {
  return webContinueDynamicHTMLResume(
    renderStream as ReadableStream<Uint8Array>,
    {
      ...opts,
      inlinedDataStream: opts.inlinedDataStream as ReadableStream<Uint8Array>,
    }
  )
}

export async function streamToBuffer(stream: AnyStream): Promise<Buffer> {
  return webStreamToBuffer(stream as ReadableStream<Uint8Array>)
}

export async function streamToUint8Array(
  stream: AnyStream
): Promise<Uint8Array> {
  return webStreamToUint8Array(stream as ReadableStream<Uint8Array>)
}

export function chainStreams(...streams: AnyStream[]): AnyStream {
  return webChainStreams(...(streams as ReadableStream<Uint8Array>[]))
}

export function createDocumentClosingStream(): AnyStream {
  return webCreateDocumentClosingStream()
}

export async function processPrelude(
  unprocessedPrelude: AnyStream
): Promise<{ prelude: AnyStream; preludeIsEmpty: boolean }> {
  return webProcessPrelude(unprocessedPrelude as ReadableStream<Uint8Array>)
}

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
  opts: FlightRenderOptions
): AnyStream {
  return ComponentMod.renderToReadableStream(payload, clientModules, opts)
}

export async function streamToString(stream: AnyStream): Promise<string> {
  return webStreamToString(stream as ReadableStream<Uint8Array>)
}

export async function renderToFizzStream(
  element: React.ReactElement,
  streamOptions: any
): Promise<FizzStreamResult> {
  const stream = await renderToInitialFizzStream({
    ReactDOMServer: { renderToReadableStream },
    element,
    streamOptions,
  })
  return { stream, allReady: stream.allReady, abort: undefined }
}

export async function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any
): Promise<FizzStreamResult> {
  const stream = await resume(element, postponedState, streamOptions)
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

export function teeStream(stream: AnyStream): [AnyStream, AnyStream] {
  return (stream as ReadableStream<Uint8Array>).tee()
}
