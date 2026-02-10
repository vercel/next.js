import type { PrerenderOptions } from 'react-dom/static'

// Re-export shared types from the canonical definition in stream-ops.node.ts
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
} from './stream-ops.node'

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
import type { PostponedState } from 'react-dom/static'

// ---------------------------------------------------------------------------
// Continue functions
// ---------------------------------------------------------------------------

export declare const continueFizzStream: (
  stream: AnyStream,
  opts: ContinueFizzStreamOptions
) => Promise<AnyStream>

export declare const continueStaticPrerender: (
  stream: AnyStream,
  opts: ContinueStaticPrerenderOptions
) => Promise<AnyStream>

export declare const continueDynamicPrerender: (
  stream: AnyStream,
  opts: ContinueStreamSharedOptions
) => Promise<AnyStream>

export declare const continueStaticFallbackPrerender: (
  stream: AnyStream,
  opts: ContinueStaticPrerenderOptions
) => Promise<AnyStream>

export declare const continueDynamicHTMLResume: (
  stream: AnyStream,
  opts: ContinueDynamicHTMLResumeOptions
) => Promise<AnyStream>

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export declare const streamToBuffer: (stream: AnyStream) => Promise<Buffer>

export declare const chainStreams: (...streams: Array<AnyStream>) => AnyStream

export declare function processPrelude(unprocessedPrelude: AnyStream): Promise<{
  prelude: AnyStream
  preludeIsEmpty: boolean
}>

export declare function createDocumentClosingStream():
  | ReadableStream<Uint8Array>
  | import('node:stream').Readable

// ---------------------------------------------------------------------------
// Composed helpers
// ---------------------------------------------------------------------------

export declare function createInlinedDataStream(
  source: AnyStream,
  nonce: string | undefined,
  formState: unknown | null
): AnyStream

export declare function createPendingStream(): AnyStream

export declare function createOnHeadersCallback(
  appendHeader: (key: string, value: string) => void
): NonNullable<PrerenderOptions['onHeaders']>

export declare function resumeAndAbort(
  element: React.ReactElement,
  postponed: PostponedState | null,
  opts: Record<string, any>
): Promise<AnyStream>

export declare function renderToFlightStream(
  ComponentMod: FlightComponentMod,
  payload: FlightPayload,
  clientModules: FlightClientModules,
  opts: FlightRenderOptions,
  runInContext?: <T>(fn: () => T) => T
): AnyStream

export declare function streamToString(stream: AnyStream): Promise<string>

export type FizzStreamResult = {
  stream: AnyStream
  allReady: Promise<void>
  abort?: (reason?: unknown) => void
}

export declare function renderToFizzStream(
  element: React.ReactElement,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult>

export declare function resumeToFizzStream(
  element: React.ReactElement,
  postponedState: PostponedState,
  streamOptions: any,
  runInContext?: <T>(fn: () => T) => T
): Promise<FizzStreamResult>

export declare function getServerPrerender(
  ComponentMod: ServerPrerenderComponentMod
): (...args: any[]) => any

export declare const getClientPrerender: typeof import('react-dom/static').prerender

export declare function pipeRuntimePrefetchTransform(
  stream: AnyStream,
  sentinel: number,
  isPartial: boolean,
  staleTime: number
): AnyStream

// ---------------------------------------------------------------------------
// Node.js <-> Web conversion helpers
// ---------------------------------------------------------------------------

// nodeReadableToWeb is only available in node bundles; undefined in web bundles.
// Declared separately so the type includes `| undefined`.
export declare const nodeReadableToWeb:
  | ((readable: import('node:stream').Readable) => ReadableStream<Uint8Array>)
  | undefined
