import { Readable } from 'node:stream'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import { htmlEscapeJsonString } from '../../htmlescape'
import isError from '../../../lib/is-error'

const flightResponses = new WeakMap<Readable, Promise<any>>()
const encoder = new TextEncoder()

export function useFlightStream<T>(
  flightStream: Readable,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  nonce?: string
): Promise<T> {
  const response = flightResponses.get(flightStream)

  if (response) {
    return response
  }

  // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
  let createFromStream
  // @TODO: investigate why the aliasing for turbopack doesn't pick this up, requiring this runtime check
  if (process.env.TURBOPACK) {
    createFromStream =
      // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-turbopack/client.node').createFromNodeStream
  } else {
    createFromStream =
      // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.node').createFromNodeStream
  }

  const newResponse = createFromStream(
    flightStream,
    {
      moduleLoading: clientReferenceManifest.moduleLoading,
      moduleMap: clientReferenceManifest.ssrModuleMapping,
    },
    {
      nonce,
    }
  )

  flightResponses.set(flightStream, newResponse)

  return newResponse
}

export function flightRenderComplete(flightStream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    flightStream
      .resume()
      .on('end', () => {
        resolve()
      })
      .on('error', (error) => {
        reject(error)
      })
  })
}

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3

export function createInlinedDataReadableStream(
  flightStream: Readable,
  nonce: string | undefined,
  formState: unknown | null
): Readable {
  const startScriptTag = nonce
    ? `<script nonce=${JSON.stringify(nonce)}>`
    : '<script>'

  const decoder = new TextDecoder('utf-8', { fatal: true })

  if (flightStream.readableFlowing) {
    flightStream.pause()
  }

  return new Readable({
    construct(callback) {
      try {
        const chunk = encoder.encode(
          `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
            JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
          )});self.__next_f.push(${htmlEscapeJsonString(
            JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
          )})</script>`
        )
        this.push(chunk)
        return callback(null)
      } catch (error) {
        return isError(error) ? callback(error) : callback()
      }
    },
    read() {
      try {
        const chunk = flightStream.read()
        if (chunk) {
          try {
            const decodedString = decoder.decode(chunk, { stream: true })
            writeFlightDataInstruction(this, startScriptTag, decodedString)
          } catch {
            writeFlightDataInstruction(this, startScriptTag, chunk)
          }
        } else {
          try {
            const decodedString = decoder.decode()
            if (decodedString) {
              writeFlightDataInstruction(this, startScriptTag, decodedString)
            }
          } catch {}

          this.push(null)
        }
      } catch (error) {
        if (isError(error)) {
          this.destroy(error)
        }
      }
    },
  })
}

function writeFlightDataInstruction(
  readable: Readable,
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

  readable.push(
    encoder.encode(
      `${scriptStart}self.__next_f.push(${htmlInlinedData})</script>`
    )
  )
}
