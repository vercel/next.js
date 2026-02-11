import type { BinaryStreamOf } from './app-render'
import type { Readable, Transform } from 'node:stream'

import { htmlEscapeJsonString } from '../htmlescape'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getClientReferenceManifest } from './manifests-singleton'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

const flightResponses = new WeakMap<
  Readable | BinaryStreamOf<unknown>,
  Promise<unknown>
>()
const encoder = new TextEncoder()
const INLINE_FLIGHT_PAYLOAD_SUFFIX = ')</script>'
const INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX = `[${INLINE_FLIGHT_PAYLOAD_BINARY},"`
const INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX = '"]'
const INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX_LENGTH =
  INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX.length
const INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX_LENGTH =
  INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX.length
const BINARY_TO_BASE64_CHUNK_SIZE = 0x8000

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
    return response as Promise<T>
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

      // When using native Node debug channels, the debug stream arrives
      // as a Node Readable directly. Fall back to Readable.fromWeb() if
      // a web ReadableStream is passed (e.g. non-Node-stream path).
      let nodeDebugStream: import('node:stream').Readable | undefined
      if (debugStream) {
        if (debugStream instanceof Readable) {
          nodeDebugStream = debugStream
        } else {
          // Node's fromWeb() overload expects stream/web.ReadableStream.
          // Convert from the global ReadableStream type to satisfy that overload.
          nodeDebugStream = Readable.fromWeb(
            debugStream as import('stream/web').ReadableStream<Uint8Array>
          )
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
        const responseOnNextTick = new Promise<T>((resolve) => {
          process.nextTick(() => {
            resolve(newResponse)
          })
        })
        flightResponses.set(flightStream, responseOnNextTick)
        return responseOnNextTick
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
        break
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
  controller.enqueue(encodeInitialFlightData(scriptStart, formState))
}

function encodeBase64Chunk(chunk: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    if (Buffer.isBuffer(chunk)) {
      return chunk.toString('base64')
    }
    return Buffer.from(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength
    ).toString('base64')
  }

  const parts: string[] = []
  for (let i = 0; i < chunk.length; i += BINARY_TO_BASE64_CHUNK_SIZE) {
    const slice = chunk.subarray(i, i + BINARY_TO_BASE64_CHUNK_SIZE)
    parts.push(String.fromCharCode(...slice))
  }
  return btoa(parts.join(''))
}

function encodeFlightPayload(chunk: string | Uint8Array): string {
  if (typeof chunk === 'string') {
    return htmlEscapeJsonString(
      `[${INLINE_FLIGHT_PAYLOAD_DATA},${JSON.stringify(chunk)}]`
    )
  }

  // Binary payloads are base64 and cannot include script-breaking tokens.
  const base64 = encodeBase64Chunk(chunk)
  return `${INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX}${base64}${INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX}`
}

function encodeFlightDataChunkNode(
  scriptPrefix: Buffer,
  scriptSuffix: Buffer,
  chunk: string | Uint8Array
): Buffer {
  if (typeof chunk === 'string') {
    const payload = htmlEscapeJsonString(
      `[${INLINE_FLIGHT_PAYLOAD_DATA},${JSON.stringify(chunk)}]`
    )
    const payloadByteLength = Buffer.byteLength(payload)
    const chunkBuffer = Buffer.allocUnsafe(
      scriptPrefix.length + payloadByteLength + scriptSuffix.length
    )

    let offset = scriptPrefix.copy(chunkBuffer, 0)
    offset += chunkBuffer.write(payload, offset, payloadByteLength, 'utf8')
    scriptSuffix.copy(chunkBuffer, offset)
    return chunkBuffer
  }

  const base64 = encodeBase64Chunk(chunk)
  const chunkBuffer = Buffer.allocUnsafe(
    scriptPrefix.length +
      INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX_LENGTH +
      base64.length +
      INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX_LENGTH +
      scriptSuffix.length
  )

  let offset = scriptPrefix.copy(chunkBuffer, 0)
  offset += chunkBuffer.write(
    INLINE_FLIGHT_PAYLOAD_BINARY_PREFIX,
    offset,
    'ascii'
  )
  offset += chunkBuffer.write(base64, offset, 'ascii')
  offset += chunkBuffer.write(
    INLINE_FLIGHT_PAYLOAD_BINARY_SUFFIX,
    offset,
    'ascii'
  )
  scriptSuffix.copy(chunkBuffer, offset)
  return chunkBuffer
}

function writeFlightDataInstruction(
  controller: ReadableStreamDefaultController,
  scriptStart: string,
  chunk: string | Uint8Array
) {
  const htmlInlinedData = encodeFlightPayload(chunk)
  controller.enqueue(
    encoder.encode(
      `${scriptStart}self.__next_f.push(${htmlInlinedData}${INLINE_FLIGHT_PAYLOAD_SUFFIX}`
    )
  )
}

function encodeInitialFlightData(
  scriptStart: string,
  formState: unknown | null
): Uint8Array {
  let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
    JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
  )})`

  if (formState != null) {
    scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
    )})`
  }

  return encoder.encode(`${scriptStart}${scriptContents}</script>`)
}

/**
 * Creates a Node.js Readable that provides inline script tag chunks for writing
 * hydration data to the client outside the React render itself.
 *
 * This is the Node.js stream equivalent of createInlinedDataReadableStream.
 */
export function createInlinedDataNodeStream(
  nonce: string | undefined,
  formState: unknown | null
): Transform {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error(
      'createInlinedDataNodeStream is not supported in edge runtime'
    )
  } else {
    const startScriptTag = nonce
      ? `<script nonce=${JSON.stringify(nonce)}>`
      : '<script>'
    const scriptPrefix = Buffer.from(`${startScriptTag}self.__next_f.push(`)
    const scriptSuffix = Buffer.from(INLINE_FLIGHT_PAYLOAD_SUFFIX)

    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bootstrapWritten = false

    const { Transform: NodeTransform } =
      require('node:stream') as typeof import('node:stream')

    return new NodeTransform({
      transform(
        chunk: Uint8Array,
        _encoding: string,
        callback: (error?: Error) => void
      ) {
        try {
          if (!bootstrapWritten) {
            bootstrapWritten = true
            this.push(encodeInitialFlightData(startScriptTag, formState))
          }

          try {
            const decodedString = decoder.decode(chunk, { stream: true })
            this.push(
              encodeFlightDataChunkNode(
                scriptPrefix,
                scriptSuffix,
                decodedString
              )
            )
          } catch {
            this.push(
              encodeFlightDataChunkNode(scriptPrefix, scriptSuffix, chunk)
            )
          }

          callback()
        } catch (error) {
          callback(error as Error)
        }
      },
      flush(callback: (error?: Error) => void) {
        // If no data was ever received, still write the bootstrap
        if (!bootstrapWritten) {
          this.push(encodeInitialFlightData(startScriptTag, formState))
        }
        callback()
      },
    })
  }
}
