import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { FlightResponseRef } from './flight-response-ref'
import { encodeText, decodeText } from '../stream-utils/encode-decode'
import { htmlEscapeJsonString } from '../htmlescape'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export function useFlightResponse(
  writable: WritableStream<Uint8Array>,
  flightStream: ReadableStream<Uint8Array>,
  clientReferenceManifest: ClientReferenceManifest,
  flightResponseRef: FlightResponseRef,
  formState: null | any,
  nonce?: string
): Promise<JSX.Element> {
  if (flightResponseRef.current !== null) {
    return flightResponseRef.current
  }
  // react-server-dom-webpack/client.edge must not be hoisted for require cache clearing to work correctly
  const {
    createFromReadableStream,
  } = require(`react-server-dom-webpack/client.edge`)

  const [renderStream, forwardStream] = flightStream.tee()
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
      if (!bootstrapped) {
        bootstrapped = true
        writer.write(
          encodeText(
            `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
              JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
            )});self.__next_f.push(${htmlEscapeJsonString(
              JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
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
        const scripts = `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
          JSON.stringify([INLINE_FLIGHT_PAYLOAD_DATA, responsePartial])
        )})</script>`

        writer.write(encodeText(scripts))
        read()
      }
    })
  }
  read()

  return res
}
