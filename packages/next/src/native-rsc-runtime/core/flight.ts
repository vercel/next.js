// The Flight half of the render, in the RSC bundles: renders the route's server
// components to a Flight stream.

import { createElement, type ComponentType, type ReactNode } from 'react'
// eslint-disable-next-line import/no-extraneous-dependencies -- external (the precompile's EXTERNALS), resolved by the app's build
import { renderToReadableStream } from 'react-server-dom-webpack/server'

// The modules of a route, as the generated entry imports them.
export interface RouteModules {
  rootLayout: { default: ComponentType<{ children?: ReactNode }> }
  page: { default: ComponentType }
}

export interface FlightInput {
  signal: AbortSignal
  // Returns the digest Flight serializes the error with.
  reportError(error: unknown): string | undefined
}

// Renders a route to Flight. Handed to the SSR bundle, which decodes the stream.
export interface FlightRenderer {
  render(input: FlightInput): ReadableStream<Uint8Array>
}

export function createFlightRenderer(modules: RouteModules): FlightRenderer {
  return {
    render({ signal, reportError }) {
      const RootLayout = modules.rootLayout.default
      const Page = modules.page.default
      // The root layout is a plain wrapper in this phase: no segment tree, params, or
      // metadata.
      const tree = createElement(RootLayout, null, createElement(Page))
      // No client components yet, so the client manifest is empty.
      return renderToReadableStream(
        tree,
        {},
        {
          signal,
          filterStackFrame: undefined,
          onError(error) {
            return reportError(error)
          },
        }
      )
    },
  }
}
