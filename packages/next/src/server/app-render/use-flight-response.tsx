import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { BinaryStreamOf } from './app-render'

import { htmlEscapeJsonString } from '../htmlescape'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

const flightResponses = new WeakMap<BinaryStreamOf<any>, Promise<any>>()
const encoder = new TextEncoder()

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightStream<T>(
  flightStream: BinaryStreamOf<T>,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
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
 * There are times when an SSR render may be finished but the RSC render
 * is ongoing and we need to wait for it to complete to make some determination
 * about how to handle the render. This function will drain the RSC reader and
 * resolve when completed. This will generally require teeing the RSC stream and it
 * should be noted that it will cause all the RSC chunks to queue in the underlying
 * ReadableStream however given Flight currently is a push stream that doesn't respond
 * to backpressure this shouldn't change how much memory is maximally consumed
 */
export async function flightRenderComplete(
  flightStream: ReadableStream<Uint8Array>
): Promise<void> {
  const flightReader = flightStream.getReader()

  while (true) {
    const { done } = await flightReader.read()
    if (done) {
      return
    }
  }
}

/**
 * Creates a ReadableStream provides inline script tag chunks for writing hydration
 * data to the client outside the React render itself.
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

  const flightReader = flightStream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })

  const readable = new ReadableStream({
    type: 'bytes',
    start(controller) {
      try {
        writeInitialInstructions(controller, startScriptTag, formState)
      } catch (error) {
        // during encoding or enqueueing forward the error downstream
        controller.error(error)
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await flightReader.read()

        if (value) {
          try {
            const decodedString = decoder.decode(value, { stream: !done })

            // The chunk cannot be decoded as valid UTF-8 string as it might
            // have arbitrary binary data.
            writeFlightDataInstruction(
              controller,
              startScriptTag,
              decodedString
            )
          } catch {
            // The chunk cannot be decoded as valid UTF-8 string.
            writeFlightDataInstruction(controller, startScriptTag, value)
          }
        }

        if (done) {
          controller.close()
        }
      } catch (error) {
        // There was a problem in the upstream reader or during decoding or enqueuing
        // forward the error downstream
        controller.error(error)
      }
    },
  })

  return readable
}

function writeInitialInstructions(
  controller: ReadableStreamDefaultController,
  scriptStart: string,
  formState: unknown | null
) {
  controller.enqueue(
    encoder.encode(
      `${scriptStart}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
      )});self.__next_f.push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
      )})</script>`
    )
  )
}

function writeFlightDataInstruction(
  controller: ReadableStreamDefaultController,
  scriptStart: string,
  chunk: string | Uint8Array
) {
  let htmlInlinedData: string

  if (typeof chunk === 'string') {
    htmlInlinedData = htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_DATA, chunk])
    )
  } else {
    // The chunk cannot be embedded as a UTF-8 string in the script tag.
    // Instead let's inline it in base64.
    // Credits to Devon Govett (devongovett) for the technique.
    // https://github.com/devongovett/rsc-html-stream
    const base64 = btoa(String.fromCodePoint(...chunk))
    htmlInlinedData = htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_BINARY, base64])
    )
  }

  controller.enqueue(
    encoder.encode(
      `${scriptStart}self.__next_f.push(${htmlInlinedData})</script>`
    )
  )
}
