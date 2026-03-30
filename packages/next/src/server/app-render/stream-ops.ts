/**
 * Compile-time switcher for stream operations.
 *
 * PR2: Simple re-export from the web implementation.
 * A future change will add a conditional branch for node streams.
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

export {
  continueFizzStream,
  continueStaticPrerender,
  continueDynamicPrerender,
  continueStaticFallbackPrerender,
  continueDynamicHTMLResume,
  streamToBuffer,
  chainStreams,
  createDocumentClosingStream,
  processPrelude,
  nodeReadableToWeb,
  createInlinedDataStream,
  createPendingStream,
  createOnHeadersCallback,
  resumeAndAbort,
  renderToFlightStream,
  streamToString,
  renderToFizzStream,
  resumeToFizzStream,
  getServerPrerender,
  getClientPrerender,
  pipeRuntimePrefetchTransform,
} from './stream-ops.web'
