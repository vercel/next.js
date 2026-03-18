/**
 * Runtime switcher for stream operations.
 *
 * When `experimental.useNodeStreams` is enabled (__NEXT_USE_NODE_STREAMS),
 * this module loads stream-ops.node.ts which uses Node.js native streams
 * for the hot-path operations (buffering, data inlining, renderToFizzStream).
 *
 * Otherwise, it loads stream-ops.web.ts which uses WhatWG web streams
 * (the current default).
 *
 * Both modules export the same API surface so callers are unaffected.
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

// When __NEXT_USE_NODE_STREAMS is true, use Node.js native streams.
// Otherwise, use WhatWG web streams (default).
type StreamOps = typeof import('./stream-ops.web')

let _m: StreamOps
if (process.env.__NEXT_USE_NODE_STREAMS) {
  _m = require('./stream-ops.node') as StreamOps
} else {
  _m = require('./stream-ops.web') as StreamOps
}

export const continueFizzStream = _m.continueFizzStream
export const continueStaticPrerender = _m.continueStaticPrerender
export const continueDynamicPrerender = _m.continueDynamicPrerender
export const continueStaticFallbackPrerender = _m.continueStaticFallbackPrerender
export const continueDynamicHTMLResume = _m.continueDynamicHTMLResume
export const streamToBuffer = _m.streamToBuffer
export const chainStreams = _m.chainStreams
export const createDocumentClosingStream = _m.createDocumentClosingStream
export const processPrelude = _m.processPrelude
export const nodeReadableToWeb = _m.nodeReadableToWeb
export const createInlinedDataStream = _m.createInlinedDataStream
export const createPendingStream = _m.createPendingStream
export const createOnHeadersCallback = _m.createOnHeadersCallback
export const resumeAndAbort = _m.resumeAndAbort
export const renderToFlightStream = _m.renderToFlightStream
export const streamToString = _m.streamToString
export const renderToFizzStream = _m.renderToFizzStream
export const resumeToFizzStream = _m.resumeToFizzStream
export const getServerPrerender = _m.getServerPrerender
export const getClientPrerender = _m.getClientPrerender
export const pipeRuntimePrefetchTransform = _m.pipeRuntimePrefetchTransform
