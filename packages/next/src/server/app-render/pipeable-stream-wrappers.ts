import type { Writable, Readable } from 'node:stream'
import type { PostponedState } from 'react-dom/static'

// Lazy require to avoid webpack trying to resolve node:stream at parse time.
// When __NEXT_USE_NODE_STREAMS is false, DCE removes all call sites so this
// require() is never reached at runtime.
function getNodeStream(): typeof import('node:stream') {
  return require('node:stream') as typeof import('node:stream')
}
import type {
  RenderToPipeableStreamOptions,
  PipeableStream,
} from 'react-dom/server'
import { DetachedPromise } from '../../lib/detached-promise'
import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'

export interface FizzPipeableStreamResult {
  stream: Readable
  allReady: Promise<void>
  abort: (reason?: unknown) => void
}

type FlightRenderToPipeableStream =
  typeof import('react-server-dom-webpack/server.node').renderToPipeableStream
type FlightRenderToReadableStream =
  typeof import('react-server-dom-webpack/server.edge').renderToReadableStream
type FlightModel = Parameters<FlightRenderToReadableStream>[0]
type FlightWebpackMap = Parameters<FlightRenderToReadableStream>[1]
type FlightRenderOptions = Parameters<FlightRenderToReadableStream>[2]
type ResumeToPipeableOptions = Parameters<
  typeof import('react-dom/server').resumeToPipeableStream
>[2] & {
  onHeaders?: NonNullable<RenderToPipeableStreamOptions['onHeaders']>
  onAllReady?: () => void
}

function wrapOnHeaders(
  onHeaders: RenderToPipeableStreamOptions['onHeaders'] | undefined
): RenderToPipeableStreamOptions['onHeaders'] | undefined {
  if (!onHeaders) return undefined
  return (headersDescriptor: Headers | HeadersInit) => {
    onHeaders(new Headers(headersDescriptor))
  }
}

/**
 * Wraps react-dom/server renderToPipeableStream in an async/await interface
 * that matches the existing renderToReadableStream usage patterns.
 *
 * The returned promise resolves when the shell is ready (onShellReady),
 * equivalent to when renderToReadableStream's promise resolves.
 */
export function renderToFizzPipeableStream(
  renderToPipeableStream: (
    children: React.ReactElement,
    options?: RenderToPipeableStreamOptions
  ) => PipeableStream,
  element: React.ReactElement,
  options?: RenderToPipeableStreamOptions
): Promise<FizzPipeableStreamResult> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () => {
    const shellReady = new DetachedPromise<FizzPipeableStreamResult>()
    const allReady = new DetachedPromise<void>()
    const { PassThrough } = getNodeStream()
    const passthrough = new PassThrough()

    const originalOnShellReady = options?.onShellReady
    const originalOnAllReady = options?.onAllReady
    const originalOnShellError = options?.onShellError

    // renderToPipeableStream calls onHeaders with a plain object descriptor
    // (e.g. { Link: "..." }), while renderToReadableStream wraps it in a
    // Headers instance. We need to do the same wrapping here so that
    // callers can use headers.forEach().
    const wrappedOnHeaders = wrapOnHeaders(options?.onHeaders)

    const { pipe, abort } = renderToPipeableStream(element, {
      ...options,
      onHeaders: wrappedOnHeaders,
      onShellReady() {
        pipe(passthrough as unknown as Writable)
        originalOnShellReady?.()
        shellReady.resolve({
          stream: passthrough,
          allReady: allReady.promise,
          abort,
        })
      },
      onAllReady() {
        originalOnAllReady?.()
        allReady.resolve()
      },
      onShellError(error: unknown) {
        originalOnShellError?.(error)
        shellReady.reject(error)
      },
    })

    return shellReady.promise
  })
}

/**
 * Wraps react-dom/server resumeToPipeableStream in an async/await interface.
 */
export function resumeToFizzPipeableStream(
  resumeToPipeableStreamFn: (
    children: React.ReactElement,
    postponedState: PostponedState,
    options?: ResumeToPipeableOptions
  ) => Promise<PipeableStream>,
  element: React.ReactElement,
  postponedState: PostponedState,
  options?: ResumeToPipeableOptions
): Promise<FizzPipeableStreamResult> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () => {
    const allReady = new DetachedPromise<void>()
    const { PassThrough } = getNodeStream()
    const passthrough = new PassThrough()

    const originalOnAllReady = options?.onAllReady
    // Same onHeaders wrapping as renderToFizzPipeableStream
    const wrappedOnHeaders = wrapOnHeaders(options?.onHeaders)

    const { pipe, abort } = await resumeToPipeableStreamFn(
      element,
      postponedState,
      {
        ...options,
        onHeaders: wrappedOnHeaders,
        onAllReady() {
          originalOnAllReady?.()
          allReady.resolve()
        },
      }
    )

    pipe(passthrough as unknown as Writable)

    return {
      stream: passthrough,
      allReady: allReady.promise,
      abort,
    }
  })
}

/**
 * Wraps react-server-dom-webpack/server.node renderToPipeableStream
 * for Flight (RSC) rendering. Since Flight rendering starts immediately
 * (no shell concept), we pipe to a PassThrough right away.
 */
export function renderToFlightPipeableStream(
  renderToPipeableStreamFn: FlightRenderToPipeableStream,
  model: FlightModel,
  webpackMap: FlightWebpackMap,
  options?: FlightRenderOptions,
  runInContext?: <T>(fn: () => T) => T
): Readable {
  const { PassThrough } = getNodeStream()
  const passthrough = new PassThrough()

  // React's renderToPipeableStream checks typeof debugChannel.write to find
  // its debug destination. The web-shaped { writable: WritableStream } doesn't
  // have .write() on the object, so convert to a Node Writable.
  if (options?.debugChannel) {
    const { toNodeDebugChannel } =
      require('./debug-channel-server') as typeof import('./debug-channel-server')
    const debugChannel = options.debugChannel
    const isNodeWritable =
      typeof debugChannel === 'object' &&
      debugChannel !== null &&
      'write' in debugChannel &&
      typeof debugChannel.write === 'function'

    options = {
      ...options,
      debugChannel: isNodeWritable
        ? debugChannel
        : toNodeDebugChannel(
            debugChannel as import('./debug-channel-server').DebugChannelServer
          ),
    }
  }

  const run: <T>(fn: () => T) => T = runInContext ?? ((fn) => fn())
  const { pipe } = run(() =>
    renderToPipeableStreamFn(
      model,
      webpackMap,
      options as Parameters<FlightRenderToPipeableStream>[2]
    )
  )
  run(() => pipe(passthrough as unknown as Writable))
  return passthrough
}
