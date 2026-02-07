import type { Writable, Readable } from 'node:stream'

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
    const originalOnHeaders = options?.onHeaders
    const wrappedOnHeaders = originalOnHeaders
      ? (headersDescriptor: any) => {
          originalOnHeaders(new Headers(headersDescriptor))
        }
      : undefined

    const { pipe, abort } = renderToPipeableStream(element, {
      ...options,
      onHeaders: wrappedOnHeaders as any,
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
    postponedState: any,
    options?: any
  ) => Promise<PipeableStream>,
  element: React.ReactElement,
  postponedState: any,
  options?: any
): Promise<FizzPipeableStreamResult> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () => {
    const allReady = new DetachedPromise<void>()
    const { PassThrough } = getNodeStream()
    const passthrough = new PassThrough()

    const originalOnAllReady = options?.onAllReady
    // Same onHeaders wrapping as renderToFizzPipeableStream
    const originalOnHeaders = options?.onHeaders
    const wrappedOnHeaders = originalOnHeaders
      ? (headersDescriptor: any) => {
          originalOnHeaders(new Headers(headersDescriptor))
        }
      : undefined

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
 *
 * When options.debugChannel is a web-style { writable: WritableStream },
 * it is bridged to a Node.js Writable so that React's Node API can use it.
 * React's renderToPipeableStream expects debugChannel to be a Node Writable
 * (has .write()), Duplex (has .read()), or WebSocket (has .send()), not the
 * web { readable?, writable } shape used by renderToReadableStream.
 */
export function renderToFlightPipeableStream(
  renderToPipeableStreamFn: (
    model: any,
    webpackMap: any,
    options?: any
  ) => PipeableStream,
  model: any,
  webpackMap: any,
  options?: any
): Readable {
  const { PassThrough, Writable: NodeWritable } = getNodeStream()
  const passthrough = new PassThrough()

  // Bridge web debug channel to Node.js Writable.
  // React's Node API checks typeof debugChannel.write === 'function' to find
  // the debug destination. A web WritableStream doesn't have .write() on the
  // object itself, so React skips setting up the debug destination while still
  // enabling debug info (because debugChannel !== undefined). This causes
  // pendingDebugChunks to accumulate without ever being flushed, preventing
  // the flight stream from completing.
  let nodeOptions = options
  const dc = options?.debugChannel
  if (dc && 'writable' in dc && typeof dc.write !== 'function') {
    const webWritable: WritableStream<Uint8Array> = dc.writable
    const writer = webWritable.getWriter()
    const nodeDebugWritable = new NodeWritable({
      write(
        chunk: Buffer | Uint8Array,
        _encoding: string,
        callback: (error?: Error | null) => void
      ) {
        writer.write(chunk).then(() => callback(), callback)
      },
      final(callback: (error?: Error | null) => void) {
        writer.close().then(() => callback(), callback)
      },
    })
    nodeOptions = { ...options, debugChannel: nodeDebugWritable }
  }

  const { pipe } = renderToPipeableStreamFn(model, webpackMap, nodeOptions)
  pipe(passthrough as unknown as Writable)
  return passthrough
}
