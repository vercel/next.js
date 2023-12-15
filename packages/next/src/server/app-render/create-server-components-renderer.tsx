import type { RenderOpts } from './types'
import type { FlightResponseRef } from './flight-response-ref'
import type { AppPageModule } from '../future/route-modules/app-page/module'
import type { createErrorHandler } from './create-error-handler'

import { use } from 'react'
import { useFlightResponse } from './use-flight-response'

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function createReactServerRenderer(
  children: React.ReactNode,
  ComponentMod: AppPageModule,
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>,
  onError: ReturnType<typeof createErrorHandler>,
  onPostpone: (reason: unknown) => void
): () => ReadableStream<Uint8Array> {
  let flightStream: ReadableStream<Uint8Array>
  return function renderToReactServerStream() {
    if (flightStream) {
      return flightStream
    } else {
      flightStream = ComponentMod.renderToReadableStream(
        children,
        clientReferenceManifest.clientModules,
        {
          onError,
          onPostpone,
        }
      )
      return flightStream
    }
  }
}

export type ServerComponentEntrypointOptions = {
  inlinedDataTransformStream: TransformStream<Uint8Array, Uint8Array>
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  formState: null | any
  nonce?: string
}
export function createReactServerEntrypoint<Props>(
  reactServerRenderer: () => ReadableStream<Uint8Array>,
  {
    inlinedDataTransformStream,
    clientReferenceManifest,
    formState,
    nonce,
  }: ServerComponentEntrypointOptions
): (props: Props) => JSX.Element {
  const flightResponseRef: FlightResponseRef = { current: null }

  const writable = inlinedDataTransformStream.writable
  return function ServerComponentWrapper(): JSX.Element {
    const reactServerStream = reactServerRenderer()
    const response = useFlightResponse(
      writable,
      reactServerStream,
      clientReferenceManifest,
      flightResponseRef,
      formState,
      nonce
    )
    return use(response)
  }
}
