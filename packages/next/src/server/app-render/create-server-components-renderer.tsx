import type { RenderOpts } from './types'
import type { FlightResponseRef } from './flight-response-ref'

import React, { use } from 'react'
import { createErrorHandler } from './create-error-handler'
import { useFlightResponse } from './use-flight-response'

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function createServerComponentRenderer<Props>(
  ComponentToRender: (props: Props) => any,
  ComponentMod: {
    renderToReadableStream: any
    __next_app__?: {
      require: any
      loadChunk: any
    }
  },
  {
    inlinedDataTransformStream,
    clientReferenceManifest,
    serverContexts,
    formState,
  }: {
    inlinedDataTransformStream: TransformStream<Uint8Array, Uint8Array>
    clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
    serverContexts: Array<
      [ServerContextName: string, JSONValue: Object | number | string]
    >
    formState: null | any
  },
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>,
  nonce?: string
): (props: Props) => JSX.Element {
  let flightStream: ReadableStream<Uint8Array>
  const createFlightStream = (props: Props) => {
    if (!flightStream) {
      flightStream = ComponentMod.renderToReadableStream(
        <ComponentToRender {...(props as any)} />,
        clientReferenceManifest.clientModules,
        {
          context: serverContexts,
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
