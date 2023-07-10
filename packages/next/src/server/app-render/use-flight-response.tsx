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
              JSON.stringify([0])
            )})</script>`
          )
        )
      }
      if (done) {
        flightResponseRef.current = null
        writer.close()
      } else {
        const responsePartial = decodeText(value, textDecoder)
        const scripts = `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
          JSON.stringify([1, responsePartial])
        )})</script>`

        writer.write(encodeText(scripts))
        read()
      }
    })
  }
  read()

  return res
}
