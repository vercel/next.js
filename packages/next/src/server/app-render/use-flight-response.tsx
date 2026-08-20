import type { BinaryStreamOf } from './app-render'
import type { Readable } from 'node:stream'

import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../../shared/lib/htmlescape'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getClientReferenceManifest } from './manifests-singleton'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

const flightResponses = new WeakMap<
  Readable | BinaryStreamOf<any>,
  Promise<any>
>()
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
export function getFlightStream<T>(
  flightStream: Readable | BinaryStreamOf<T>,
  debugStream: Readable | ReadableStream<Uint8Array> | undefined,
  debugEndTime: number | undefined,
  nonce: string | undefined
): Promise<T> {
  const response = flightResponses.get(flightStream)

  if (response) {
    return response
  }

  const { moduleLoading, edgeSSRModuleMapping, ssrModuleMapping } =
    getClientReferenceManifest()

  let newResponse: Promise<T>
  if (flightStream instanceof ReadableStream) {
    // The types of flightStream and debugStream should match.
    if (debugStream && !(debugStream instanceof ReadableStream)) {
      throw new InvariantError('Expected debug stream to be a ReadableStream')
    }

    // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
    const { createFromReadableStream } =
      // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client') as typeof import('react-server-dom-webpack/client')

    newResponse = createFromReadableStream<T>(flightStream, {
      findSourceMapURL,
      serverConsumerManifest: {
        moduleLoading,
        moduleMap: isEdgeRuntime ? edgeSSRModuleMapping : ssrModuleMapping,
        serverModuleMap: null,
      },
      nonce,
      debugChannel: debugStream ? { readable: debugStream } : undefined,
      endTime: debugEndTime,
    })
  } else {
    if (process.env.NEXT_RUNTIME === 'edge') {
      throw new InvariantError(
        'getFlightStream should always receive a ReadableStream when using the edge runtime'
      )
    } else {
      const { Readable } =
        require('node:stream') as typeof import('node:stream')

      // Convert debug stream to Readable if it's a ReadableStream.
      // When __NEXT_USE_NODE_STREAMS is enabled, the debug channel produces
      // Node Readables natively. Otherwise, it produces web ReadableStreams.
      let nodeDebugStream: Readable | undefined
      if (debugStream) {
        if (debugStream instanceof Readable) {
          nodeDebugStream = debugStream
        } else {
          type WebReadableStream = import('stream/web').ReadableStream
          nodeDebugStream = Readable.fromWeb(debugStream as WebReadableStream)
        }
      }

      // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
      const { createFromNodeStream } =
        // eslint-disable-next-line import/no-extraneous-dependencies
        require('react-server-dom-webpack/client') as typeof import('react-server-dom-webpack/client')

      newResponse = createFromNodeStream<T>(
        flightStream,
        {
          moduleLoading,
          moduleMap: isEdgeRuntime ? edgeSSRModuleMapping : ssrModuleMapping,
          serverModuleMap: null,
        },
        {
          findSourceMapURL,
          nonce,
          debugChannel: nodeDebugStream,
          endTime: debugEndTime,
        }
      )
    }
  }

  // Edge pages are never prerendered so they necessarily cannot have a workUnitStore type
  // that requires the nextTick behavior. This is why it is safe to access a node only API here
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const workUnitStore = workUnitAsyncStorage.getStore()

    if (!workUnitStore) {
      throw new InvariantError('Expected workUnitAsyncStorage to have a store.')
    }

    switch (workUnitStore.type) {
      case 'prerender-client':
      case 'validation-client':
        const responseOnNextTick = new Promise<T>((resolve) => {
          process.nextTick(() => {
            resolve(newResponse)
          })
        })
        flightResponses.set(flightStream, responseOnNextTick)
        return responseOnNextTick
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'generate-static-params':
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
  formState: unknown | null,
  externalBrowserRuntime: boolean
): ReadableStream<Uint8Array> {
  const markup = createFlightMarkup(nonce, externalBrowserRuntime)

  const flightReader = flightStream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })

  const readable = new ReadableStream({
    type: 'bytes',
    start(controller) {
      try {
        writeInitialInstructions(controller, markup, formState)
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
            writeFlightDataInstruction(controller, markup, decodedString)
          } catch {
            // The chunk cannot be decoded as valid UTF-8 string.
            writeFlightDataInstruction(controller, markup, value)
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
  markup: FlightMarkup,
  formState: unknown | null
) {
  controller.enqueue(encoder.encode(markup.initial(formState)))
}

function writeFlightDataInstruction(
  controller: ReadableStreamDefaultController,
  markup: FlightMarkup,
  chunk: string | Uint8Array
) {
  controller.enqueue(encoder.encode(markup.data(chunk)))
}

/**
 * The attribute that carries one Flight payload when
 * `experimental.externalBrowserRuntime` is enabled. Kept in sync with the
 * collector in `packages/next/src/client/app-index.tsx`.
 */
export const FLIGHT_DATA_ATTRIBUTE = 'data-next-flight'

export type FlightMarkup = {
  initial: (formState: unknown | null) => string
  data: (chunk: string | Uint8Array) => string
}

function encodeBinaryChunk(chunk: Uint8Array): string {
  // The chunk cannot be embedded as a UTF-8 string, so inline it as base64.
  // Credits to Devon Govett (devongovett) for the technique.
  // https://github.com/devongovett/rsc-html-stream
  return typeof Buffer !== 'undefined'
    ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString(
        'base64'
      )
    : btoa(String.fromCodePoint(...chunk))
}

/**
 * Builds the HTML that carries the Flight payload to the browser.
 *
 * By default each payload is an inline `<script>` that pushes onto
 * `self.__next_f`, which requires a CSP to allow `unsafe-inline` (or a nonce).
 * With `experimental.externalBrowserRuntime` each payload is instead an inert
 * `<template>` carrying the same JSON in an attribute, collected by
 * `app-index.tsx` and pushed onto the same queue. The payload shape is identical
 * in both modes, so the client-side consumer is unchanged.
 */
export function createFlightMarkup(
  nonce: string | undefined,
  externalBrowserRuntime: boolean
): FlightMarkup {
  const startScriptTag = nonce
    ? `<script nonce="${htmlEscapeAttributeString(nonce)}">`
    : '<script>'

  if (externalBrowserRuntime) {
    const template = (payload: unknown[]): string =>
      `<template ${FLIGHT_DATA_ATTRIBUTE}="${htmlEscapeAttributeString(
        JSON.stringify(payload)
      )}"></template>`

    return {
      initial(formState) {
        let html = template([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
        if (formState != null) {
          html += template([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
        }
        return html
      },
      data(chunk) {
        return typeof chunk === 'string'
          ? template([INLINE_FLIGHT_PAYLOAD_DATA, chunk])
          : template([INLINE_FLIGHT_PAYLOAD_BINARY, encodeBinaryChunk(chunk)])
      },
    }
  }

  return {
    initial(formState) {
      let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
        JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
      )})`

      if (formState != null) {
        scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
          JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
        )})`
      }

      return `${startScriptTag}${scriptContents}</script>`
    },
    data(chunk) {
      const htmlInlinedData = htmlEscapeJsonString(
        JSON.stringify(
          typeof chunk === 'string'
            ? [INLINE_FLIGHT_PAYLOAD_DATA, chunk]
            : [INLINE_FLIGHT_PAYLOAD_BINARY, encodeBinaryChunk(chunk)]
        )
      )
      return `${startScriptTag}self.__next_f.push(${htmlInlinedData})</script>`
    },
  }
}
