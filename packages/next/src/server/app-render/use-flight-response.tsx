import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { BinaryStreamOf } from './app-render'

import { htmlEscapeJsonString } from '../htmlescape'
import {
  chainStreams,
  bufferEntireReadableStream,
  streamFromString,
} from '../stream-utils/node-web-streams-helper'
import {
  createDecodeTransformStream,
  createEncodeTransformStream,
} from '../stream-utils/encode-decode'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2

const flightResponses = new WeakMap<BinaryStreamOf<any>, Promise<any>>()

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightStream<T>(
  flightStream: BinaryStreamOf<T>,
  clientReferenceManifest: ClientReferenceManifest,
  nonce?: string
): Promise<T> {
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

  const newResponse = createFromReadableStream(flightStream, {
    ssrManifest: {
      moduleLoading: clientReferenceManifest.moduleLoading,
      moduleMap: isEdgeRuntime
        ? clientReferenceManifest.edgeSSRModuleMapping
        : clientReferenceManifest.ssrModuleMapping,
    },
    nonce,
  })

  flightResponses.set(flightStream, newResponse)

  return newResponse
}

/**
 * The eager form of this function will return a readable stream that has a complete property
 * which can be awaited. The reason for doing this eagerly is that during certain render modes
 * we may want to ensure the entire react server stream has completed before making a determination
 * such as whether a dynamic API was used. In other render modes we may not care to track this
 * and want to maximize the use of backpressure with the underlying streams.
 *
 * @param flightStream The RSC render stream
 * @param nonce optionally a nonce used during this particular render
 * @param formState optionally the formState used with this particular render
 * @returns a Promise<ReadableStream> which resolves when the underlying flight stream has been completely consumed
 */
export async function createEagerInlinedDataReadableStream(
  flightStream: ReadableStream<Uint8Array>,
  nonce: string | undefined,
  formState: unknown | null
): Promise<ReadableStream<Uint8Array>> {
  // We start reading the stream eagerly in the start method to ensure we drain
  // the underlying react stream as quickly as possible. While this will increase memory
  // usage it will allow us to make a correct determination of whether the flight render
  // used dynamic APIs prior to deciding whether we will continue the stream or not
  return await bufferEntireReadableStream(
    createInlinedDataReadableStream(flightStream, nonce, formState)
  )
}

/**
 * The lazy form of this function will return a readable stream which will pull
 * from the underlying react stream as capacity allows. This is useful when we do not
 * need to track the completion of the underlying RSC stream prior to making certain determinations
 * such as whether a dynamic API was used during a prerender.
 *
 * @param flightStream The RSC render stream
 * @param nonce optionally a nonce used during this particular render
 * @param formState optionally the formState used with this particular render
 * @returns a ReadableStream without the complete property. This signifies a lazy ReadableStream
 */
export function createInlinedDataReadableStream(
  flightStream: ReadableStream<Uint8Array>,
  nonce: string | undefined,
  formState: unknown | null
): ReadableStream<Uint8Array> {
  const startScriptTag = nonce
    ? `<script nonce=${JSON.stringify(nonce)}>`
    : '<script>'

  return chainStreams(
    streamFromString(
      `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
      )});self.__next_f.push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
      )})</script>`
    ),
    flightStream
      .pipeThrough(
        createDecodeTransformStream(new TextDecoder('utf-8', { fatal: true }))
      )
      .pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(
              `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
                JSON.stringify([INLINE_FLIGHT_PAYLOAD_DATA, chunk])
              )})</script>`
            )
          },
        })
      )
      .pipeThrough(createEncodeTransformStream())
  )
}
