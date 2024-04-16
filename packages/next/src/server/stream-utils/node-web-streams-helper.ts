import { getTracer } from '../lib/trace/tracer'
import { AppRenderSpan } from '../lib/trace/constants'

function voidCatch() {
  // this catcher is designed to be used with pipeTo where we expect the underlying
  // pipe implementation to forward errors but we don't want the pipeTo promise to reject
  // and be unhandled
}

export type ReactReadableStream = ReadableStream<Uint8Array> & {
  allReady?: Promise<void> | undefined
}

// We can share the same encoder instance everywhere
// Notably we cannot do the same for TextDecoder because it is stateful
// when handling streaming data
const encoder = new TextEncoder()

export function chainStreams<T>(
  ...streams: ReadableStream<T>[]
): ReadableStream<T> {
  // We could encode this invariant in the arguments but current uses of this function pass
  // use spread so it would be missed by
  if (streams.length === 0) {
    throw new Error('Invariant: chainStreams requires at least one stream')
  }

  // If we only have 1 stream we fast path it by returning just this stream
  if (streams.length === 1) {
    return streams[0]
  }

  const { readable, writable } = new TransformStream()

  // We always initiate pipeTo immediately. We know we have at least 2 streams
  // so we need to avoid closing the writable when this one finishes.
  let promise = streams[0].pipeTo(writable, { preventClose: true })

  let i = 1
  for (; i < streams.length - 1; i++) {
    const nextStream = streams[i]
    promise = promise.then(() =>
      nextStream.pipeTo(writable, { preventClose: true })
    )
  }

  // We can omit the length check because we halted before the last stream and there
  // is at least two streams so the lastStream here will always be defined
  const lastStream = streams[i]
  promise = promise.then(() => lastStream.pipeTo(writable))

  // Catch any errors from the streams and ignore them, they will be handled
  // by whatever is consuming the readable stream.
  promise.catch(voidCatch)

  return readable
}

export function streamFromString(str: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str))
      controller.close()
    },
  })
}

export async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let string = ''

  // @ts-expect-error TypeScript gets this wrong (https://nodejs.org/api/webstreams.html#async-iteration)
  for await (const chunk of stream) {
    string += decoder.decode(chunk, { stream: true })
  }

  string += decoder.decode()

  return string
}

export function renderToInitialFizzStream({
  ReactDOMServer,
  element,
  streamOptions,
}: {
  ReactDOMServer: typeof import('react-dom/server.edge')
  element: React.ReactElement
  streamOptions?: any
}): Promise<ReactReadableStream> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () =>
    ReactDOMServer.renderToReadableStream(element, streamOptions)
  )
}
