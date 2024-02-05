import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import { htmlEscapeJsonString } from '../htmlescape'
import {
  createDecodeTransformStream,
  createEncodeTransformStream,
} from '../stream-utils/encode-decode'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2

function createFlightTransformer(
  nonce: string | undefined,
  formState: unknown | null
) {
  const startScriptTag = nonce
    ? `<script nonce=${JSON.stringify(nonce)}>`
    : '<script>'

  return new TransformStream<string, string>({
    // Bootstrap the flight information.
    start(controller) {
      controller.enqueue(
        `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
          JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
        )});self.__next_f.push(${htmlEscapeJsonString(
          JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
        )})</script>`
      )
    },
    transform(chunk, controller) {
      const scripts = `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_DATA, chunk])
      )})</script>`

      controller.enqueue(scripts)
    },
  })
}

const flightResponses = new WeakMap<
  ReadableStream<Uint8Array>,
  Promise<JSX.Element>
>()

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightResponse(
  writable: WritableStream<Uint8Array>,
  flightStream: ReadableStream<Uint8Array>,
  clientReferenceManifest: ClientReferenceManifest,
  formState: null | any,
  nonce?: string
): Promise<JSX.Element> {
  const response = flightResponses.get(flightStream)

  if (response) {
    return response
  }

  // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
  let createFromReadableStream
  // @TODO: investigate why the aliasing for turbopack doesn't pick this up, requiring this runtime check
  if (process.env.TURBOPACK) {
    createFromReadableStream =
      // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-turbopack/client.edge').createFromReadableStream
  } else {
    createFromReadableStream =
      // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge').createFromReadableStream
  }

  const [renderStream, forwardStream] = flightStream.tee()
  const res = createFromReadableStream(renderStream, {
    ssrManifest: {
      moduleLoading: clientReferenceManifest.moduleLoading,
      moduleMap: isEdgeRuntime
        ? clientReferenceManifest.edgeSSRModuleMapping
        : clientReferenceManifest.ssrModuleMapping,
    },
    nonce,
  })
  flightResponses.set(flightStream, res)

  pipeFlightDataToInlinedStream(forwardStream, writable, nonce, formState)

  return res
}

function pipeFlightDataToInlinedStream(
  flightStream: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
  nonce: string | undefined,
  formState: unknown | null
): void {
  flightStream
    .pipeThrough(createDecodeTransformStream())
    .pipeThrough(createFlightTransformer(nonce, formState))
    .pipeThrough(createEncodeTransformStream())
    .pipeTo(writable)
    .catch((err) => {
      console.error('Unexpected error while rendering Flight stream', err)
    })
}
