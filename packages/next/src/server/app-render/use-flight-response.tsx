import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { BinaryStreamOf } from './app-render'

import { htmlEscapeJsonString } from '../htmlescape'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

const flightResponses = new WeakMap<BinaryStreamOf<any>, Promise<any>>()
const encoder = new TextEncoder()

const findSourceMapURL =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .findSourceMapURLDEV
    : undefined

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightStream<T>(
  flightStream: BinaryStreamOf<T>,
  debugStream: ReadableStream<Uint8Array> | undefined,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  nonce: string | undefined
): Promise<T> {
  const response = flightResponses.get(flightStream)

  if (response) {
    return response
  }

  // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
  const { createFromReadableStream } =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/client') as typeof import('react-server-dom-webpack/client')

  const newResponse = createFromReadableStream<T>(flightStream, {
    findSourceMapURL,
    serverConsumerManifest: {
      moduleLoading: clientReferenceManifest.moduleLoading,
      moduleMap: isEdgeRuntime
        ? clientReferenceManifest.edgeSSRModuleMapping
        : clientReferenceManifest.ssrModuleMapping,
      serverModuleMap: null,
    },
    nonce,
    debugChannel: debugStream ? { readable: debugStream } : undefined,
  })

  // Edge pages are never prerendered so they necessarily cannot have a workUnitStore type
  // that requires the nextTick behavior. This is why it is safe to access a node only API here
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const workUnitStore = workUnitAsyncStorage.getStore()

    if (!workUnitStore) {
      throw new InvariantError('Expected workUnitAsyncStorage to have a store.')
    }

    switch (workUnitStore.type) {
      case 'prerender-client':
        const responseOnNextTick = new Promise<T>((resolve) => {
          process.nextTick(() => resolve(newResponse))
        })
        flightResponses.set(flightStream, responseOnNextTick)
        return responseOnNextTick
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  flightResponses.set(flightStream, newResponse)

  return newResponse
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
  let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
    JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
  )})`

  if (formState != null) {
    scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
    )})`
  }

  controller.enqueue(encoder.encode(`${scriptStart}${scriptContents}</script>`))
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
