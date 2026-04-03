/**
 * Compile-time switcher for stream operations.
 *
 * When __NEXT_USE_NODE_STREAMS is true, uses Node.js pipeable stream APIs.
 * Otherwise, uses web ReadableStream APIs.
 *
 * Both modules export AnyStream = AnyStreamType so their type surfaces are
 * structurally identical — no `as unknown as` cast is needed.
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

let _m: WebMod
if (process.env.__NEXT_USE_NODE_STREAMS) {
  _m = require('./stream-ops.node') as typeof import('./stream-ops.node')
} else {
  _m = require('./stream-ops.web') as typeof import('./stream-ops.web')
}

export const continueFizzStream = _m.continueFizzStream
export const continueStaticPrerender = _m.continueStaticPrerender
export const continueDynamicPrerender = _m.continueDynamicPrerender
export const continueStaticFallbackPrerender =
  _m.continueStaticFallbackPrerender
export const continueDynamicHTMLResume = _m.continueDynamicHTMLResume
export const streamToBuffer = _m.streamToBuffer
export const chainStreams = _m.chainStreams
export const createDocumentClosingStream = _m.createDocumentClosingStream
export const processPrelude = _m.processPrelude
export const createInlinedDataStream = _m.createInlinedDataStream
export const createPendingStream = _m.createPendingStream
export const createOnHeadersCallback = _m.createOnHeadersCallback
export const resumeAndAbort = _m.resumeAndAbort
export const renderToFlightStream = _m.renderToFlightStream
export const streamToString = _m.streamToString
export const streamToUint8Array = _m.streamToUint8Array
export const renderToFizzStream = _m.renderToFizzStream
export const resumeToFizzStream = _m.resumeToFizzStream
export const getServerPrerender = _m.getServerPrerender
export const getClientPrerender = _m.getClientPrerender
export const pipeRuntimePrefetchTransform = _m.pipeRuntimePrefetchTransform
export const teeStream = _m.teeStream
