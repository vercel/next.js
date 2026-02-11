import type { PrerenderOptions, PostponedState } from 'react-dom/static'
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
} from './stream-ops.web'

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
} from './stream-ops.web'

export type FizzStreamResult = {
  stream: AnyStream
  allReady: Promise<void>
  abort?: (reason?: unknown) => void
}

type StreamOpsRuntimeModule = {
  continueFizzStream: (
    stream: AnyStream,
    opts: ContinueFizzStreamOptions
  ) => Promise<AnyStream>
  continueStaticPrerender: (
    stream: AnyStream,
    opts: ContinueStaticPrerenderOptions
  ) => Promise<AnyStream>
  continueDynamicPrerender: (
    stream: AnyStream,
    opts: ContinueStreamSharedOptions
  ) => Promise<AnyStream>
  continueStaticFallbackPrerender: (
    stream: AnyStream,
    opts: ContinueStaticPrerenderOptions
  ) => Promise<AnyStream>
  continueDynamicHTMLResume: (
    stream: AnyStream,
    opts: ContinueDynamicHTMLResumeOptions
  ) => Promise<AnyStream>
  streamToBuffer: (stream: AnyStream) => Promise<Buffer>
  chainStreams: (...streams: Array<AnyStream>) => AnyStream
  processPrelude: (unprocessedPrelude: AnyStream) => Promise<{
    prelude: AnyStream
    preludeIsEmpty: boolean
  }>
  createDocumentClosingStream: () => AnyStream
  createInlinedDataStream: (
    source: AnyStream,
    nonce: string | undefined,
    formState: unknown | null
  ) => AnyStream
  createPendingStream: () => AnyStream
  createOnHeadersCallback: (
    appendHeader: (key: string, value: string) => void
  ) => NonNullable<PrerenderOptions['onHeaders']>
  resumeAndAbort: (
    element: React.ReactElement,
    postponed: PostponedState | null,
    opts: Record<string, any>
  ) => Promise<AnyStream>
  renderToFlightStream: (
    ComponentMod: FlightComponentMod,
    payload: FlightPayload,
    clientModules: FlightClientModules,
    opts: FlightRenderOptions,
    runInContext?: <T>(fn: () => T) => T
  ) => AnyStream
  streamToString: (stream: AnyStream) => Promise<string>
  renderToFizzStream: (
    element: React.ReactElement,
    streamOptions: any,
    runInContext?: <T>(fn: () => T) => T
  ) => Promise<FizzStreamResult>
  resumeToFizzStream: (
    element: React.ReactElement,
    postponedState: PostponedState,
    streamOptions: any,
    runInContext?: <T>(fn: () => T) => T
  ) => Promise<FizzStreamResult>
  getServerPrerender: (
    ComponentMod: ServerPrerenderComponentMod
  ) => (...args: any[]) => any
  getClientPrerender: typeof import('react-dom/static').prerender
  pipeRuntimePrefetchTransform: (
    stream: AnyStream,
    sentinel: number,
    isPartial: boolean,
    staleTime: number
  ) => AnyStream
  nodeReadableToWeb:
    | ((readable: import('node:stream').Readable) => ReadableStream<Uint8Array>)
    | undefined
}

let streamOpsRuntimeModule: StreamOpsRuntimeModule

if (process.env.__NEXT_USE_NODE_STREAMS) {
  streamOpsRuntimeModule =
    require('./stream-ops.node') as typeof import('./stream-ops.node') as unknown as StreamOpsRuntimeModule
} else {
  streamOpsRuntimeModule =
    require('./stream-ops.web') as typeof import('./stream-ops.web') as unknown as StreamOpsRuntimeModule
}

export const continueFizzStream = streamOpsRuntimeModule.continueFizzStream
export const continueStaticPrerender =
  streamOpsRuntimeModule.continueStaticPrerender
export const continueDynamicPrerender =
  streamOpsRuntimeModule.continueDynamicPrerender
export const continueStaticFallbackPrerender =
  streamOpsRuntimeModule.continueStaticFallbackPrerender
export const continueDynamicHTMLResume =
  streamOpsRuntimeModule.continueDynamicHTMLResume
export const streamToBuffer = streamOpsRuntimeModule.streamToBuffer
export const chainStreams = streamOpsRuntimeModule.chainStreams
export const processPrelude = streamOpsRuntimeModule.processPrelude
export const createDocumentClosingStream =
  streamOpsRuntimeModule.createDocumentClosingStream
export const createInlinedDataStream =
  streamOpsRuntimeModule.createInlinedDataStream
export const createPendingStream = streamOpsRuntimeModule.createPendingStream
export const createOnHeadersCallback =
  streamOpsRuntimeModule.createOnHeadersCallback
export const resumeAndAbort = streamOpsRuntimeModule.resumeAndAbort
export const renderToFlightStream = streamOpsRuntimeModule.renderToFlightStream
export const streamToString = streamOpsRuntimeModule.streamToString
export const renderToFizzStream = streamOpsRuntimeModule.renderToFizzStream
export const resumeToFizzStream = streamOpsRuntimeModule.resumeToFizzStream
export const getServerPrerender = streamOpsRuntimeModule.getServerPrerender
export const getClientPrerender = streamOpsRuntimeModule.getClientPrerender
export const pipeRuntimePrefetchTransform =
  streamOpsRuntimeModule.pipeRuntimePrefetchTransform
export const nodeReadableToWeb = streamOpsRuntimeModule.nodeReadableToWeb
