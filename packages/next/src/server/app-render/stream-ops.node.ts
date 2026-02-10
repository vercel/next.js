/**
 * Node.js stream operations for the rendering pipeline.
 * Loaded by stream-ops.js when __NEXT_USE_NODE_STREAMS is true.
 */

import type { Readable } from 'node:stream'
import { Readable as NodeReadable } from 'node:stream'

import type { PostponedState, PrerenderOptions } from 'react-dom/static'
import {
  resumeAndPrerenderToNodeStream,
  prerenderToNodeStream,
} from 'react-dom/static'
import * as ReactDOMServer from 'react-dom/server'

import {
  renderToFlightPipeableStream,
  renderToFizzPipeableStream,
  resumeToFizzPipeableStream,
} from './pipeable-stream-wrappers'
import {
  nodeStreamToString,
  safePipe,
  createRuntimePrefetchNodeTransform,
} from '../stream-utils/node-stream-helpers'
import { createInlinedDataNodeStream } from './use-flight-response'

// ---------------------------------------------------------------------------
// Shared types (imported by stream-ops.web.ts via `import type`)
// ---------------------------------------------------------------------------

export type AnyStream = ReadableStream<Uint8Array> | Readable

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

type FlightRenderToReadableStream =
  typeof import('react-server-dom-webpack/server.edge').renderToReadableStream
type FlightRenderToPipeableStream =
  typeof import('react-server-dom-webpack/server.node').renderToPipeableStream
type FlightPrerender =
  typeof import('react-server-dom-webpack/static').prerender
type FlightPrerenderToNodeStream =
  typeof import('react-server-dom-webpack/static').prerenderToNodeStream

export type FlightComponentMod = {
  renderToReadableStream: FlightRenderToReadableStream
  renderToPipeableStream?: FlightRenderToPipeableStream
}

export type ServerPrerenderComponentMod = {
  prerender: FlightPrerender
  prerenderToNodeStream?: FlightPrerenderToNodeStream
}

export type FlightPayload = Parameters<FlightRenderToReadableStream>[0]
export type FlightClientModules = Parameters<FlightRenderToReadableStream>[1]
export type FlightRenderOptions = Parameters<FlightRenderToReadableStream>[2]
type ResumeAndPrerenderOptions = Parameters<
  typeof import('react-dom/static').resumeAndPrerenderToNodeStream
>[2]

// ---------------------------------------------------------------------------
// Continue functions
// ---------------------------------------------------------------------------

export {
  continueFizzStreamNode as continueFizzStream,
  continueStaticPrerenderNode as continueStaticPrerender,
  continueDynamicPrerenderNode as continueDynamicPrerender,
  continueStaticFallbackPrerenderNode as continueStaticFallbackPrerender,
  continueDynamicHTMLResumeNode as continueDynamicHTMLResume,
  nodeStreamToBuffer as streamToBuffer,
  chainNodeStreams as chainStreams,
  createDocumentClosingNodeStream as createDocumentClosingStream,
  nodeReadableToWeb,
} from '../stream-utils/node-stream-helpers'

export { processNodePrelude as processPrelude } from './app-render-prerender-utils'

// ---------------------------------------------------------------------------
// Composed helpers
// ---------------------------------------------------------------------------

export function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  return safePipe(
    source as Readable,
    createInlinedDataNodeStream(nonce, formState)
  )
}

export function createPendingStream(): AnyStream {
  return new NodeReadable({ read() {} })
}

export function createOnHeadersCallback(
  appendHeader: (key: string, value: string) => void
): NonNullable<PrerenderOptions['onHeaders']> {
  return (headersDescriptor: Headers) => {
    const headers = new Headers(headersDescriptor)
    headers.forEach((value: string, key: string) => {
      appendHeader(key, value)
    })
  }
}

export async function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: ResumeAndPrerenderOptions
): Promise<AnyStream> {
  const { prelude } = await resumeAndPrerenderToNodeStream(
    element,
    postponed,
    opts
  )
  return prelude as unknown as Readable
}

export function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: FlightPayload,
  clientModules: FlightClientModules,
  opts: FlightRenderOptions,
  runInContext?: <T>(fn: () => T) => T
): AnyStream {
  return renderToFlightPipeableStream(
    ComponentMod.renderToPipeableStream!,
    payload,
    clientModules,
    opts,
    runInContext
  )
}

export async function streamToString(stream: AnyStream): Promise<string> {
  return nodeStreamToString(stream as Readable)
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
  const renderFn = (...args: any[]) =>
    run(() => (ReactDOMServer as any).renderToPipeableStream(...args))
  return renderToFizzPipeableStream(renderFn, element, streamOptions)
}

export async function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult> {
  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())
  const resumeFn = (...args: any[]) =>
    run(() => (ReactDOMServer as any).resumeToPipeableStream(...args))
  return resumeToFizzPipeableStream(
    resumeFn,
    element,
    postponedState,
    streamOptions
  )
}

export function getServerPrerender(
  ComponentMod: ServerPrerenderComponentMod
): (...args: any[]) => any {
  return ComponentMod.prerenderToNodeStream! as unknown as (
    ...args: any[]
  ) => any
}

export const getClientPrerender: typeof import('react-dom/static').prerender =
  prerenderToNodeStream as unknown as typeof getClientPrerender

export function pipeRuntimePrefetchTransform(
  stream: AnyStream,
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): AnyStream {
  return safePipe(
    stream as Readable,
    createRuntimePrefetchNodeTransform(sentinel, isPartial, staleTime)
  )
}
