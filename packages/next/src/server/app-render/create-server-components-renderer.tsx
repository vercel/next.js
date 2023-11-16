import type { RenderOpts } from './types'
import type { FlightResponseRef } from './flight-response-ref'
import type { AppPageModule } from '../future/route-modules/app-page/module'
import type { createErrorHandler } from './create-error-handler'

import React, { use } from 'react'
import { useFlightResponse } from './use-flight-response'

export type ServerComponentRendererOptions = {
  ComponentMod: AppPageModule
  inlinedDataTransformStream: TransformStream<Uint8Array, Uint8Array>
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  formState: null | any
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>
  nonce?: string
}

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function createServerComponentRenderer<Props>(
  ComponentToRender: (props: Props) => any,
  {
    ComponentMod,
    inlinedDataTransformStream,
    clientReferenceManifest,
    formState,
    nonce,
    serverComponentsErrorHandler,
  }: ServerComponentRendererOptions
): (props: Props) => JSX.Element {
  let flightStream: ReadableStream<Uint8Array>
  const createFlightStream = (props: Props) => {
    if (!flightStream) {
      flightStream = ComponentMod.renderToReadableStream(
        <ComponentToRender {...(props as any)} />,
        clientReferenceManifest.clientModules,
        {
          onError: serverComponentsErrorHandler,
        }
      )
    }
    return flightStream
  }

  const flightResponseRef: FlightResponseRef = { current: null }

  const writable = inlinedDataTransformStream.writable
  return function ServerComponentWrapper(props: Props): JSX.Element {
    const response = useFlightResponse(
      writable,
      createFlightStream(props),
      clientReferenceManifest,
      flightResponseRef,
      formState,
      nonce
    )
    return use(response)
  }
}
