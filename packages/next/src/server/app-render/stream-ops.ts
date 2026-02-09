/**
 * Compile-time conditional stream operations.
 *
 * This module uses `process.env.__NEXT_USE_NODE_STREAMS` (a compile-time flag
 * set by webpack DefinePlugin) to export the correct stream implementation.
 * In the nodestreams bundles the flag is `true` and web-stream code is DCE'd;
 * in normal bundles it is `false` (or undefined) and node-stream code is DCE'd.
 *
 * The pattern matches the one already established in `entry-base.ts`.
 */

import type { Readable } from 'node:stream'
import type { PostponedState, PrerenderOptions } from 'react-dom/static'

type AnyStream = ReadableStream<Uint8Array> | Readable

type ContinueStreamSharedOptions = {
  deploymentId: string | undefined
  getServerInsertedHTML: () => Promise<string>
  getServerInsertedMetadata: () => Promise<string>
}

type ContinueFizzStreamOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream | undefined
  isStaticGeneration: boolean
  allReady?: Promise<void>
  validateRootLayout?: boolean
  suffix?: string
}

type ContinueStaticPrerenderOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream
}

type ContinueDynamicHTMLResumeOptions = ContinueStreamSharedOptions & {
  inlinedDataStream: AnyStream
  delayDataUntilFirstHtmlChunk: boolean
}

type ComponentModRenderToReadableStream =
  typeof import('react-server-dom-webpack/server.edge').renderToReadableStream
type ComponentModRenderToPipeableStream =
  typeof import('react-server-dom-webpack/server.node').renderToPipeableStream
type ComponentModPrerender =
  typeof import('react-server-dom-webpack/static').prerender
type ComponentModPrerenderToNodeStream =
  typeof import('react-server-dom-webpack/static').prerenderToNodeStream

type FlightComponentMod = {
  renderToReadableStream: ComponentModRenderToReadableStream
  renderToPipeableStream?: ComponentModRenderToPipeableStream
}

type ServerPrerenderComponentMod = {
  prerender: ComponentModPrerender
  prerenderToNodeStream?: ComponentModPrerenderToNodeStream
}

type FlightPayload = Parameters<ComponentModRenderToReadableStream>[0]
type FlightClientModules = Parameters<ComponentModRenderToReadableStream>[1]
type FlightRenderOptions = Parameters<ComponentModRenderToReadableStream>[2]
type ResumeOptions = Parameters<typeof import('react-dom/server').resume>[2]
type ResumeAndPrerenderOptions = Parameters<
  typeof import('react-dom/static').resumeAndPrerenderToNodeStream
>[2]

// ---------------------------------------------------------------------------
// Continue functions (replaces ~8 large if/else blocks in app-render.tsx)
// ---------------------------------------------------------------------------

export const continueFizzStream: (
  stream: AnyStream,
  opts: ContinueFizzStreamOptions
) => Promise<AnyStream> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueFizzStreamNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueFizzStream
) as typeof continueFizzStream

export const continueStaticPrerender: (
  stream: AnyStream,
  opts: ContinueStaticPrerenderOptions
) => Promise<AnyStream> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueStaticPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueStaticPrerender
) as typeof continueStaticPrerender

export const continueDynamicPrerender: (
  stream: AnyStream,
  opts: ContinueStreamSharedOptions
) => Promise<AnyStream> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueDynamicPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueDynamicPrerender
) as typeof continueDynamicPrerender

export const continueStaticFallbackPrerender: (
  stream: AnyStream,
  opts: ContinueStaticPrerenderOptions
) => Promise<AnyStream> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueStaticFallbackPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueStaticFallbackPrerender
) as typeof continueStaticFallbackPrerender

export const continueDynamicHTMLResume: (
  stream: AnyStream,
  opts: ContinueDynamicHTMLResumeOptions
) => Promise<AnyStream> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueDynamicHTMLResumeNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueDynamicHTMLResume
) as typeof continueDynamicHTMLResume

// ---------------------------------------------------------------------------
// Utility functions (replaces ~10 ternaries)
// ---------------------------------------------------------------------------

export const streamToBuffer: (stream: AnyStream) => Promise<Buffer> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).nodeStreamToBuffer
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).streamToBuffer
) as typeof streamToBuffer

export const chainStreams: (...streams: Array<AnyStream>) => AnyStream = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).chainNodeStreams
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).chainStreams
) as typeof chainStreams

export const processPrelude: (unprocessedPrelude: AnyStream) => Promise<{
  prelude: AnyStream
  preludeIsEmpty: boolean
}> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('./app-render-prerender-utils') as typeof import('./app-render-prerender-utils')
      ).processNodePrelude
    : (
        require('./app-render-prerender-utils') as typeof import('./app-render-prerender-utils')
      ).processPrelude
) as typeof processPrelude

// ---------------------------------------------------------------------------
// Composed helpers
// ---------------------------------------------------------------------------

/**
 * Wraps flight data into inline script tags for the HTML stream.
 * Node path uses safePipe composition; web path calls
 * createInlinedDataReadableStream directly.
 */
export function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { safePipe } =
      require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
    const { createInlinedDataNodeStream } =
      require('./use-flight-response') as typeof import('./use-flight-response')
    return safePipe(
      source as Readable,
      createInlinedDataNodeStream(nonce, formState)
    )
  }
  const { createInlinedDataReadableStream } =
    require('./use-flight-response') as typeof import('./use-flight-response')
  return createInlinedDataReadableStream(
    source as ReadableStream<Uint8Array>,
    nonce,
    formState
  )
}

/**
 * Creates a stream that never emits data (used for resume-and-abort patterns).
 */
export function createPendingStream(): AnyStream {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { Readable: NodeReadable } =
      require('node:stream') as typeof import('node:stream')
    return new NodeReadable({ read() {} })
  }
  return new ReadableStream<Uint8Array>()
}

/**
 * Wraps onHeaders to normalize prerenderToNodeStream's plain-object headers
 * into the same interface as renderToReadableStream's Headers object.
 */
export function createOnHeadersCallback(
  appendHeader: (key: string, value: string) => void
): NonNullable<PrerenderOptions['onHeaders']> {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    return (headersDescriptor: Headers) => {
      const headers = new Headers(headersDescriptor)
      headers.forEach((value: string, key: string) => {
        appendHeader(key, value)
      })
    }
  }
  return (headers: Headers) => {
    headers.forEach((value, key) => {
      appendHeader(key, value)
    })
  }
}

/**
 * Resumes a postponed render and returns the prelude stream
 * (used for abort-only resume).
 * Web: resume() returns a stream directly.
 * Node: resumeAndPrerenderToNodeStream() returns { prelude }.
 */
export async function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: (ResumeOptions & { nonce?: string }) | ResumeAndPrerenderOptions
): Promise<AnyStream> {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { resumeAndPrerenderToNodeStream } =
      require('react-dom/static') as typeof import('react-dom/static')
    const { prelude } = await resumeAndPrerenderToNodeStream(
      element,
      postponed,
      opts as ResumeAndPrerenderOptions
    )
    return prelude as unknown as Readable
  }
  const { resume } =
    require('react-dom/server') as typeof import('react-dom/server')
  return resume(element, postponed as PostponedState, opts as ResumeOptions)
}

/**
 * Renders RSC Flight data to a stream.
 * Web: uses ComponentMod.renderToReadableStream
 * Node: wraps ComponentMod.renderToPipeableStream via renderToFlightPipeableStream
 */
export function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: FlightPayload,
  clientModules: FlightClientModules,
  opts: FlightRenderOptions
): AnyStream {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { renderToFlightPipeableStream } =
      require('./pipeable-stream-wrappers') as typeof import('./pipeable-stream-wrappers')
    return renderToFlightPipeableStream(
      ComponentMod.renderToPipeableStream!,
      payload,
      clientModules,
      opts
    )
  }
  return ComponentMod.renderToReadableStream(payload, clientModules, opts)
}

/**
 * Returns the appropriate RSC prerender function from ComponentMod.
 */
export function getServerPrerender(
  ComponentMod: ServerPrerenderComponentMod
): (...args: any[]) => any {
  return process.env.__NEXT_USE_NODE_STREAMS
    ? (ComponentMod.prerenderToNodeStream as unknown as (...args: any[]) => any)
    : ComponentMod.prerender
}

// The postponed state is an opaque value from React DOM's prerender that
// flows directly to Next.js's getDynamicHTMLPostponedState. React DOM and
// Next.js define incompatible branded PostponedState types, so we use the
// React DOM type here (via Awaited<ReturnType<typeof prerender>>).
/**
 * Returns the appropriate Fizz prerender function from react-dom/static.
 * We intentionally type this as the web signature to keep call sites stable;
 * in nodestreams bundles the selected function returns a Node stream at runtime.
 */
export const getClientPrerender: typeof import('react-dom/static').prerender = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (require('react-dom/static') as typeof import('react-dom/static'))
        .prerenderToNodeStream
    : (require('react-dom/static') as typeof import('react-dom/static'))
        .prerender
) as typeof getClientPrerender

/**
 * Creates a closing stream for the document.
 * Web: createDocumentClosingStream
 * Node: createDocumentClosingNodeStream
 */
export const createDocumentClosingStream: () =>
  | ReadableStream<Uint8Array>
  | Readable = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).createDocumentClosingNodeStream
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).createDocumentClosingStream
) as typeof createDocumentClosingStream
