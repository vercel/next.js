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
    transformStream,
    clientReferenceManifest,
    serverContexts,
    rscChunks,
    formState,
  }: {
    transformStream: TransformStream<Uint8Array, Uint8Array>
    clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
    serverContexts: Array<
      [ServerContextName: string, JSONValue: Object | number | string]
    >
    rscChunks: Uint8Array[]
    formState: null | any
  },
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>,
  nonce?: string
): (props: Props) => JSX.Element {
  let RSCStream: ReadableStream<Uint8Array>
  const createRSCStream = (props: Props) => {
    if (!RSCStream) {
      RSCStream = ComponentMod.renderToReadableStream(
        <ComponentToRender {...(props as any)} />,
        clientReferenceManifest.clientModules,
        {
          context: serverContexts,
          onError: serverComponentsErrorHandler,
        }
      )
    }
    return RSCStream
  }

  const flightResponseRef: FlightResponseRef = { current: null }

  const writable = transformStream.writable
  return function ServerComponentWrapper(props: Props): JSX.Element {
    const reqStream = createRSCStream(props)
    const response = useFlightResponse(
      writable,
      reqStream,
      clientReferenceManifest,
      rscChunks,
      flightResponseRef,
      formState,
      nonce
    )
    return use(response)
  }
}
