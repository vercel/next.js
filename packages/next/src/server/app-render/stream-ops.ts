/**
 * Compile-time switcher for stream operations.
 *
 * When __NEXT_USE_NODE_STREAMS is true, uses Node.js pipeable stream APIs.
 * Otherwise, uses web ReadableStream APIs.
 *
 * Types are always sourced from stream-ops.web (the API surface is identical).
 * In the Node path, AnyStream is Readable at runtime, but consumers see
 * ReadableStream<Uint8Array> from the type exports — the module-level cast
 * bridges this intentional mismatch in one place.
 */
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
  FizzStreamResult,
} from './stream-ops.web'

type WebMod = typeof import('./stream-ops.web')

export let continueFizzStream: WebMod['continueFizzStream']
export let continueStaticPrerender: WebMod['continueStaticPrerender']
export let continueDynamicPrerender: WebMod['continueDynamicPrerender']
export let continueStaticFallbackPrerender: WebMod['continueStaticFallbackPrerender']
export let continueDynamicHTMLResume: WebMod['continueDynamicHTMLResume']
export let streamToBuffer: WebMod['streamToBuffer']
export let chainStreams: WebMod['chainStreams']
export let createDocumentClosingStream: WebMod['createDocumentClosingStream']
export let processPrelude: WebMod['processPrelude']
export let createInlinedDataStream: WebMod['createInlinedDataStream']
export let createPendingStream: WebMod['createPendingStream']
export let createOnHeadersCallback: WebMod['createOnHeadersCallback']
export let resumeAndAbort: WebMod['resumeAndAbort']
export let renderToFlightStream: WebMod['renderToFlightStream']
export let streamToString: WebMod['streamToString']
export let renderToFizzStream: WebMod['renderToFizzStream']
export let resumeToFizzStream: WebMod['resumeToFizzStream']
export let getServerPrerender: WebMod['getServerPrerender']
export let getClientPrerender: WebMod['getClientPrerender']
export let pipeRuntimePrefetchTransform: WebMod['pipeRuntimePrefetchTransform']

if (process.env.__NEXT_USE_NODE_STREAMS) {
  // The node module uses Readable where the web module uses ReadableStream.
  // Consumers always see the web types via the type exports above, so we
  // bridge to WebMod once here rather than casting per-export.
  const _m: WebMod =
    require('./stream-ops.node') as typeof import('./stream-ops.node') as unknown as WebMod
  continueFizzStream = _m.continueFizzStream
  continueStaticPrerender = _m.continueStaticPrerender
  continueDynamicPrerender = _m.continueDynamicPrerender
  continueStaticFallbackPrerender = _m.continueStaticFallbackPrerender
  continueDynamicHTMLResume = _m.continueDynamicHTMLResume
  streamToBuffer = _m.streamToBuffer
  chainStreams = _m.chainStreams
  createDocumentClosingStream = _m.createDocumentClosingStream
  processPrelude = _m.processPrelude
  createInlinedDataStream = _m.createInlinedDataStream
  createPendingStream = _m.createPendingStream
  createOnHeadersCallback = _m.createOnHeadersCallback
  resumeAndAbort = _m.resumeAndAbort
  renderToFlightStream = _m.renderToFlightStream
  streamToString = _m.streamToString
  renderToFizzStream = _m.renderToFizzStream
  resumeToFizzStream = _m.resumeToFizzStream
  getServerPrerender = _m.getServerPrerender
  getClientPrerender = _m.getClientPrerender
  pipeRuntimePrefetchTransform = _m.pipeRuntimePrefetchTransform
} else {
  const _m = require('./stream-ops.web') as typeof import('./stream-ops.web')
  continueFizzStream = _m.continueFizzStream
  continueStaticPrerender = _m.continueStaticPrerender
  continueDynamicPrerender = _m.continueDynamicPrerender
  continueStaticFallbackPrerender = _m.continueStaticFallbackPrerender
  continueDynamicHTMLResume = _m.continueDynamicHTMLResume
  streamToBuffer = _m.streamToBuffer
  chainStreams = _m.chainStreams
  createDocumentClosingStream = _m.createDocumentClosingStream
  processPrelude = _m.processPrelude
  createInlinedDataStream = _m.createInlinedDataStream
  createPendingStream = _m.createPendingStream
  createOnHeadersCallback = _m.createOnHeadersCallback
  resumeAndAbort = _m.resumeAndAbort
  renderToFlightStream = _m.renderToFlightStream
  streamToString = _m.streamToString
  renderToFizzStream = _m.renderToFizzStream
  resumeToFizzStream = _m.resumeToFizzStream
  getServerPrerender = _m.getServerPrerender
  getClientPrerender = _m.getClientPrerender
  pipeRuntimePrefetchTransform = _m.pipeRuntimePrefetchTransform
}
