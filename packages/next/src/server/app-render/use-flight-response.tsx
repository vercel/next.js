import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { BinaryStreamOf } from './app-render'

import { use } from 'react'
import { htmlEscapeJsonString } from '../htmlescape'
import {
  createDecodeTransformStream,
  createEncodeTransformStream,
} from '../stream-utils/encode-decode'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2

const Responses = new WeakMap()

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

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightResponse<T>(
  writable: WritableStream<Uint8Array>,
  flightStream: BinaryStreamOf<T>,
  clientReferenceManifest: ClientReferenceManifest,
  formState: null | any,
  nonce?: string
): T {
  if (Responses.has(flightStream)) {
    return use(Responses.get(flightStream)!)
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

  // This stream will be transformed into client route cache seeding scripts
  // appended to the end of the SSR stream.
  // @TODO-APP: this hook is currently only used in SSR however React applications
  // generally need the same shape during SSR as they will have on the client
  // because things like useID are contextual to the tree shape. In the future
  // we should organize this bit of code somewhere else so that we can use it
  // in both places
  forwardStream
    .pipeThrough(createDecodeTransformStream())
    .pipeThrough(createFlightTransformer(nonce, formState))
    .pipeThrough(createEncodeTransformStream())
    .pipeTo(writable)
    .catch((err) => {
      console.error('Unexpected error while rendering Flight stream', err)
    })

  // This actually constructs the RSC Response that will be rendered by React during
  // the SSR pass. We stash it on the responseRef so we can avoid recreating
  // it when this component rerenders
  const res = createFromReadableStream(renderStream, {
    ssrManifest: {
      moduleLoading: clientReferenceManifest.moduleLoading,
      moduleMap: isEdgeRuntime
        ? clientReferenceManifest.edgeSSRModuleMapping
        : clientReferenceManifest.ssrModuleMapping,
    },
    nonce,
  })
  Responses.set(flightStream, res)

  return use(res)
}
