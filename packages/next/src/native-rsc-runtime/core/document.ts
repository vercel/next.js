// The Fizz half of the render, in the SSR bundles: decodes the route's Flight stream
// and renders it to HTML.

import { createElement, use, type ReactNode } from 'react'
// Fizz, from the vendored React that App Router loads: the renderer uses Next's copy of
// React, never the app's. `react` resolves to it in the SSR layer; `react-dom/server`
// doesn't (it maps to a separate compiled copy with its own React), so Fizz comes from
// the vendored module directly.
import { renderToReadableStream } from 'next/dist/server/route-modules/app-page/vendored/ssr/react-dom-server'
// eslint-disable-next-line import/no-extraneous-dependencies -- external (the precompile's EXTERNALS), resolved by the app's build
import { createFromReadableStream } from 'react-server-dom-webpack/client'
import type { RenderResult, RouteRenderer } from '../interface/renderer'
import type { FlightRenderer } from './flight'

export function createRouteRenderer(flight: FlightRenderer): RouteRenderer {
  return {
    renderDocument({ signal, reportError }): RenderResult {
      // The render stops when the client goes away, either way a host can say so: by
      // aborting `signal`, or by cancelling `body`. After that nothing is reported, since
      // what React reports then is the stop itself, not a render error. Before it, a host
      // error that means the same is skipped by name, as App Router does.
      const renderController = new AbortController()
      const renderSignal = renderController.signal
      function stop(reason: unknown) {
        if (!renderSignal.aborted) renderController.abort(reason)
      }
      // Flight stops with the render, or on its own once nothing reads it anymore. On a
      // stop, Flight's listener runs before Fizz's (it's added first), so Fizz can read
      // Flight's abort as an error in the stream. `renderSignal` is already aborted by
      // then, and `reportFizzError` skips everything after that, so it isn't reported.
      const flightController = new AbortController()
      renderSignal.addEventListener(
        'abort',
        () => flightController.abort(renderSignal.reason),
        { once: true }
      )
      if (signal.aborted) {
        stop(signal.reason)
      } else {
        signal.addEventListener('abort', () => stop(signal.reason), {
          once: true,
        })
      }

      // Flight serializes each error it reports with a digest, and Fizz rethrows it when
      // it decodes the stream. Fizz skips the errors Flight already reported, by digest,
      // so each is reported once, as the original. An abort error gets a digest too, so
      // Fizz skips its copy, but isn't reported. The digest is a per-render counter: it
      // doesn't reach the client yet.
      const flightErrorDigests = new Set<string>()
      function reportFlightError(error: unknown): string | undefined {
        if (flightController.signal.aborted) return undefined
        const digest = String(flightErrorDigests.size + 1)
        flightErrorDigests.add(digest)
        if (!isAbortError(error)) reportError(error)
        return digest
      }
      function reportFizzError(error: unknown) {
        if (renderSignal.aborted || isAbortError(error)) return
        const digest = (error as { digest?: unknown } | null)?.digest
        if (typeof digest === 'string' && flightErrorDigests.has(digest)) return
        reportError(error)
      }
      const tree = createFromReadableStream<ReactNode>(
        flight.render({
          signal: flightController.signal,
          reportError: reportFlightError,
        }),
        {
          // No client components yet, so there's nothing to load.
          serverConsumerManifest: {
            moduleMap: {},
            serverModuleMap: null,
            moduleLoading: null,
          },
          findSourceMapURL: undefined,
        }
      )
      function Document() {
        return use(tree)
      }
      const html = renderToReadableStream(createElement(Document), {
        signal: renderSignal,
        onError: reportFizzError,
      })
      const head: RenderResult['head'] = html.then(
        () => ({ outcome: { type: 'rendered' } }),
        () => {
          // The shell failed, or the render stopped first. Any error was reported, and
          // nothing reads Flight anymore, so it stops.
          flightController.abort()
          return { outcome: { type: 'error' } }
        }
      )
      // A stopped render ends `body` with an error, not a clean close: Fizz's own abort
      // closes its stream normally, which would make a cut-off document look complete.
      let reader: ReadableStreamDefaultReader<Uint8Array> | null | undefined
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (renderSignal.aborted) {
            controller.error(renderSignal.reason)
          } else {
            renderSignal.addEventListener(
              'abort',
              () => controller.error(renderSignal.reason),
              { once: true }
            )
          }
        },
        async pull(controller) {
          if (reader === undefined) {
            reader = await html.then(
              (stream) => stream.getReader(),
              () => null
            )
          }
          if (renderSignal.aborted) return
          // The shell failed: the body is empty.
          if (reader === null) return controller.close()
          let chunk: ReadableStreamReadResult<Uint8Array>
          try {
            chunk = await reader.read()
          } catch (error) {
            // The HTML stream errored, so `body` errors too, and Flight stops.
            flightController.abort()
            throw error
          }
          if (renderSignal.aborted) return
          if (chunk.done) controller.close()
          else controller.enqueue(chunk.value)
        },
        cancel(reason) {
          stop(reason)
        },
      })
      return { head, body }
    },
  }
}

// The abort errors App Router's `isAbortError` matches: an `AbortError`, or the
// `ResponseAborted` a Node host aborts with when the client goes away.
function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name } = error as { name?: unknown }
  return name === 'AbortError' || name === 'ResponseAborted'
}
