import { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import { htmlEscapeJsonString } from '../htmlescape'
import { isEdgeRuntime } from './app-render'
import { FlightResponseRef } from './flight-response-ref'

class RSCTransformStream extends TransformStream<string, string> {
  constructor(nonce?: string) {
    const startScriptTag = nonce
      ? `<script nonce=${JSON.stringify(nonce)}>`
      : '<script>'

    super({
      start(controller) {
        controller.enqueue(
          `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
            JSON.stringify([0])
          )})</script>`
        )
      },
      transform(chunk, controller) {
        controller.enqueue(
          `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
            JSON.stringify([1, chunk])
          )})</script>`
        )
      },
    })
  }
}

class RSCChunkWritableStream extends WritableStream<Uint8Array> {
  constructor(chunks: Uint8Array[]) {
    super({
      write(chunk) {
        if (!chunk) return

        chunks.push(chunk)
      },
    })
  }
}

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
export async function useFlightResponse(
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
  } = require('next/dist/compiled/react-server-dom-webpack/client.edge')

  // Break the request stream into two streams. One for the Flight response
  // and one for the writer.
  const [renderStream, forwardStream] = req.tee()

  // Create the Flight response.
  const res = createFromReadableStream(renderStream, {
    moduleMap: isEdgeRuntime
      ? clientReferenceManifest.edgeSSRModuleMapping
      : clientReferenceManifest.ssrModuleMapping,
  })

  // Add the reference to the flight response object.
  flightResponseRef.current = res

  // Create the two readers for the stream.
  const [rcsChunkReader, writerReader] = forwardStream.tee()

  const promises: Array<Promise<unknown>> = [
    // TODO: (wyattjoh) doesn't look like these chunks are used, maybe we can remove this?
    // Collect all the chunks from the stream.
    rcsChunkReader
      // Collects all the chunks into the array.
      .pipeTo(new RSCChunkWritableStream(rscChunks)),

    // Generate all the script tags to send down.
    writerReader
      // Decode the Uint8Array chunks into strings.
      .pipeThrough(new TextDecoderStream())
      // This transformer is used to take React Server Components chunks and
      // transform them into a stream of script tags that will be injected into
      // the HTML.
      .pipeThrough(new RSCTransformStream(nonce))
      // Re-encode the strings into Uint8Array chunks.
      .pipeThrough(new TextEncoderStream())
      // Send the chunks to the writable stream. This will automatically close
      // the stream when the reader is done.
      .pipeTo(writable),
  ]

  // Once all the promises are done, we can update the reference.
  Promise.all(promises).finally(() => {
    flightResponseRef.current = null
  })

  return res
}
