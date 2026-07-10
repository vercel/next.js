import type { BinaryStreamOf } from './app-render'
import type { Readable } from 'node:stream'
import type { SubresourceIntegrityAlgorithm } from '../../build/webpack/plugins/subresource-integrity-plugin'

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

/**
 * Compute a Subresource Integrity hash of a script's text content.
 *
 * Per the W3C SRI specification (https://www.w3.org/TR/SRI/#the-integrity-attribute),
 * the integrity value for an inline script is "algorithm-base64hash" where the hash
 * is computed over the script element's text content (the bytes between <script> and
 * </script>).
 *
 * This enables strict CSP without 'unsafe-inline': when every inline script carries
 * an integrity attribute whose hash matches its content, browsers that support SRI
 * for inline scripts will execute them even under a script-src policy that omits
 * 'unsafe-inline'. See also: https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity
 *
 * @param scriptContent The text content between <script> and </script> tags
 * @param algorithm The hashing algorithm ('sha256', 'sha384', or 'sha512')
 * @returns The integrity attribute value, e.g. "sha256-abc123..."
 */
async function computeInlineScriptIntegrity(
  scriptContent: string,
  algorithm: SubresourceIntegrityAlgorithm
): Promise<string> {
  const data = encoder.encode(scriptContent)
  // Web Crypto API is available in all supported runtimes:
  // Edge runtime, Node.js 18+ (globalThis.crypto.subtle), and browsers.
  // This avoids bundling the Node.js 'crypto' module which isn't
  // available in Edge/ESM builds.
  // Map SRI algorithm names (e.g. 'sha256') to Web Crypto format ('SHA-256')
  const webCryptoAlgorithm = algorithm
    .toUpperCase()
    .replace(/^(\D+)(\d+)$/, '$1-$2')
  const hashBuffer = await globalThis.crypto.subtle.digest(
    webCryptoAlgorithm,
    data
  )
  const hashArray = new Uint8Array(hashBuffer)
  let hashBase64 = ''
  if (typeof Buffer !== 'undefined') {
    hashBase64 = Buffer.from(hashArray).toString('base64')
  } else {
    // Edge runtime — no Buffer available, use manual base64
    for (let i = 0; i < hashArray.length; i++) {
      hashBase64 += String.fromCharCode(hashArray[i])
    }
    hashBase64 = btoa(hashBase64)
  }
  return `${algorithm}-${hashBase64}`
}

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
      case 'prerender-ppr':
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
 * When an SRI algorithm is provided, each inline <script> tag receives an
 * `integrity` attribute computed from its text content. This allows strict
 * CSP policies (script-src without 'unsafe-inline') to trust these scripts
 * via Subresource Integrity, as specified in:
 * https://www.w3.org/TR/SRI/#the-integrity-attribute
 *
 * @param flightStream The RSC render stream
 * @param nonce optionally a nonce used during this particular render
 * @param formState optionally the formState used with this particular render
 * @param sriAlgorithm optionally the SRI algorithm for computing integrity hashes
 * @returns a ReadableStream without the complete property. This signifies a lazy ReadableStream
 */
export function createInlinedDataReadableStream(
  flightStream: ReadableStream<Uint8Array>,
  nonce: string | undefined,
  formState: unknown | null,
  sriAlgorithm?: SubresourceIntegrityAlgorithm
): ReadableStream<Uint8Array> {
  const flightReader = flightStream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })

  const readable = new ReadableStream({
    type: 'bytes',
    start(controller) {
      try {
        writeInitialInstructions(controller, formState, nonce, sriAlgorithm)
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
            await writeFlightDataInstruction(
              controller,
              decodedString,
              nonce,
              sriAlgorithm
            )
          } catch {
            // The chunk cannot be decoded as valid UTF-8 string.
            await writeFlightDataInstruction(
              controller,
              value,
              nonce,
              sriAlgorithm
            )
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

async function writeInitialInstructions(
  controller: ReadableStreamDefaultController,
  formState: unknown | null,
  nonce: string | undefined,
  sriAlgorithm?: SubresourceIntegrityAlgorithm
) {
  let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
    JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
  )})`

  if (formState != null) {
    scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
    )})`
  }

  const integrityAttr = sriAlgorithm
    ? ` integrity="${htmlEscapeAttributeString(await computeInlineScriptIntegrity(scriptContents, sriAlgorithm))}"`
    : ''
  const nonceAttr = nonce ? ` nonce="${htmlEscapeAttributeString(nonce)}"` : ''

  controller.enqueue(
    encoder.encode(
      `<script${nonceAttr}${integrityAttr}>${scriptContents}</script>`
    )
  )
}

async function writeFlightDataInstruction(
  controller: ReadableStreamDefaultController,
  chunk: string | Uint8Array,
  nonce: string | undefined,
  sriAlgorithm?: SubresourceIntegrityAlgorithm
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
    const base64 =
      typeof Buffer !== 'undefined'
        ? Buffer.from(
            chunk.buffer,
            chunk.byteOffset,
            chunk.byteLength
          ).toString('base64')
        : btoa(String.fromCodePoint(...chunk))
    htmlInlinedData = htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_BINARY, base64])
    )
  }

  const scriptContents = `self.__next_f.push(${htmlInlinedData})`
  const integrityAttr = sriAlgorithm
    ? ` integrity="${htmlEscapeAttributeString(await computeInlineScriptIntegrity(scriptContents, sriAlgorithm))}"`
    : ''
  const nonceAttr = nonce ? ` nonce="${htmlEscapeAttributeString(nonce)}"` : ''

  controller.enqueue(
    encoder.encode(
      `<script${nonceAttr}${integrityAttr}>${scriptContents}</script>`
    )
  )
}
