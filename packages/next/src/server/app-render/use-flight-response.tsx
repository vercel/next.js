import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { FlightResponseRef } from './flight-response-ref'
import { readableStreamTee } from '../stream-utils/node-web-streams-helper'
import { encodeText, decodeText } from '../stream-utils/encode-decode'
import { htmlEscapeJsonString } from '../htmlescape'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightResponse(
  writable: WritableStream<Uint8Array>,
  req: ReadableStream<Uint8Array>,
  clientReferenceManifest: ClientReferenceManifest,
  rscChunks: Uint8Array[],
  flightResponseRef: FlightResponseRef,
  nonce?: string
): Promise<JSX.Element> {
  if (flightResponseRef.current !== null) {
    return flightResponseRef.current
  }
  // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
  const {
    createFromReadableStream,
  } = require(`react-server-dom-webpack/client.edge`)

  const [renderStream, forwardStream] = readableStreamTee(req)
  const res = createFromReadableStream(renderStream, {
    moduleMap: isEdgeRuntime
      ? clientReferenceManifest.edgeSSRModuleMapping
      : clientReferenceManifest.ssrModuleMapping,
  })
  flightResponseRef.current = res

  let bootstrapped = false
  // We only attach CSS chunks to the inlined data.
  const forwardReader = forwardStream.getReader()
  const writer = writable.getWriter()
  const startScriptTag = nonce
    ? `<script nonce=${JSON.stringify(nonce)}>`
    : '<script>'
  const textDecoder = new TextDecoder()

  function read() {
    forwardReader.read().then(({ done, value }) => {
      if (value) {
        rscChunks.push(value)
      }

      if (!bootstrapped) {
        bootstrapped = true
        writer.write(
          encodeText(
            `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
              JSON.stringify(0)
            )})</script>`
          )
        )
      }
      if (done) {
        // Add a setTimeout here because the error component is too small, the first forwardReader.read() read will return the full chunk
        // and then it immediately set flightResponseRef.current as null.
        // react renders the component twice, the second render will run into the state with useFlightResponse where flightResponseRef.current is null,
        // so it tries to render the flight payload again
        setTimeout(() => {
          flightResponseRef.current = null
        })
        writer.close()
      } else {
        const responsePartial = decodeText(value, textDecoder)
        const scripts = `${startScriptTag}__next_f.push(${htmlEscapeJsonString(
          // Since the inlined payload is always a JSON-ish encoded string with
          // many double quotes, we can safely un-escape these quotes and use
          // a single quote to wrap the string. This saves a lot of bytes.
          JSON.stringify(responsePartial)
            .replace(/\\"/g, '"')
            .replace(/'/g, "\\'")
            .replace(/(^")|("$)/g, "'")
        )})</script>`

        writer.write(encodeText(scripts))
        read()
      }
    })
  }
  read()

  return res
}
