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

// ---------------------------------------------------------------------------
// Continue functions (replaces ~8 large if/else blocks in app-render.tsx)
// ---------------------------------------------------------------------------

export const continueFizzStream: (
  stream: ReadableStream<Uint8Array> | Readable,
  opts: any
) => Promise<ReadableStream<Uint8Array> | Readable> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueFizzStreamNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueFizzStream
) as typeof continueFizzStream

export const continueStaticPrerender: (
  stream: ReadableStream<Uint8Array> | Readable,
  opts: any
) => Promise<ReadableStream<Uint8Array> | Readable> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueStaticPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueStaticPrerender
) as typeof continueStaticPrerender

export const continueDynamicPrerender: (
  stream: ReadableStream<Uint8Array> | Readable,
  opts: any
) => Promise<ReadableStream<Uint8Array> | Readable> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueDynamicPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueDynamicPrerender
) as typeof continueDynamicPrerender

export const continueStaticFallbackPrerender: (
  stream: ReadableStream<Uint8Array> | Readable,
  opts: any
) => Promise<ReadableStream<Uint8Array> | Readable> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).continueStaticFallbackPrerenderNode
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).continueStaticFallbackPrerender
) as typeof continueStaticFallbackPrerender

export const continueDynamicHTMLResume: (
  stream: ReadableStream<Uint8Array> | Readable,
  opts: any
) => Promise<ReadableStream<Uint8Array> | Readable> = (
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

export const streamToBuffer: (
  stream: ReadableStream<Uint8Array> | Readable
) => Promise<Buffer> = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).nodeStreamToBuffer
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).streamToBuffer
) as typeof streamToBuffer

export const chainStreams: (
  ...streams: Array<ReadableStream<Uint8Array> | Readable>
) => ReadableStream<Uint8Array> | Readable = (
  process.env.__NEXT_USE_NODE_STREAMS
    ? (
        require('../stream-utils/node-stream-helpers') as typeof import('../stream-utils/node-stream-helpers')
      ).chainNodeStreams
    : (
        require('../stream-utils/node-web-streams-helper') as typeof import('../stream-utils/node-web-streams-helper')
      ).chainStreams
) as typeof chainStreams

export const processPrelude: (
  unprocessedPrelude: ReadableStream<Uint8Array> | Readable
) => Promise<{
  prelude: ReadableStream<Uint8Array> | Readable
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
  source: ReadableStream<Uint8Array> | Readable,
  nonce: string | undefined,
  formState: unknown | null
): ReadableStream<Uint8Array> | Readable {
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
export function createPendingStream(): ReadableStream<Uint8Array> | Readable {
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
): (headers: any) => void {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    return (headersDescriptor: any) => {
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
  postponed: any,
  opts: any
): Promise<ReadableStream<Uint8Array> | Readable> {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { resumeAndPrerenderToNodeStream } =
      require('react-dom/static') as typeof import('react-dom/static')
    const { prelude } = await (resumeAndPrerenderToNodeStream as any)(
      element,
      postponed,
      opts
    )
    return prelude
  }
  const { resume } =
    require('react-dom/server') as typeof import('react-dom/server')
  return (resume as any)(element, postponed, opts)
}

/**
 * Renders RSC Flight data to a stream.
 * Web: uses ComponentMod.renderToReadableStream
 * Node: wraps ComponentMod.renderToPipeableStream via renderToFlightPipeableStream
 */
export function renderToFlightStream(
  ComponentMod: any,
  payload: any,
  clientModules: any,
  opts: any
): ReadableStream<Uint8Array> | Readable {
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
export function getServerPrerender(ComponentMod: any): (...args: any[]) => any {
  return process.env.__NEXT_USE_NODE_STREAMS
    ? ComponentMod.prerenderToNodeStream!
    : ComponentMod.prerender
}

// The postponed state is an opaque value from React DOM's prerender that
// flows directly to Next.js's getDynamicHTMLPostponedState. React DOM and
// Next.js define incompatible branded PostponedState types, so we use the
// React DOM type here (via Awaited<ReturnType<typeof prerender>>).
type PrerenderResult = Awaited<
  ReturnType<typeof import('react-dom/static').prerender>
> & {
  // Widen prelude to include Node Readable for the nodestreams variant
  prelude: ReadableStream<Uint8Array> | Readable
}

/**
 * Returns the appropriate Fizz prerender function from react-dom/static.
 * Both `prerender` (web) and `prerenderToNodeStream` (node) accept the
 * same arguments but return different stream types in their result. The
 * unified return type captures both.
 */
export const getClientPrerender: (...args: any[]) => Promise<PrerenderResult> =
  (
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
