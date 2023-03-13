import type { FlightRouterState } from './app-render'
import { nonNullable } from '../lib/non-nullable'
import { getTracer } from './lib/trace/tracer'
import { AppRenderSpan } from './lib/trace/constants'

const queueTask =
  process.env.NEXT_RUNTIME === 'edge' ? globalThis.setTimeout : setImmediate

export type ReactReadableStream = ReadableStream<Uint8Array> & {
  allReady?: Promise<void> | undefined
}

export function encodeText(input: string) {
  return new TextEncoder().encode(input)
}

export function decodeText(
  input: Uint8Array | undefined,
  textDecoder: TextDecoder
) {
  return textDecoder.decode(input, { stream: true })
}

export function readableStreamTee<T = any>(
  readable: ReadableStream<T>
): [ReadableStream<T>, ReadableStream<T>] {
  const transformStream = new TransformStream()
  const transformStream2 = new TransformStream()
  const writer = transformStream.writable.getWriter()
  const writer2 = transformStream2.writable.getWriter()

  const reader = readable.getReader()
  function read() {
    reader.read().then(({ done, value }) => {
      if (done) {
        writer.close()
        writer2.close()
        return
      }
      writer.write(value)
      writer2.write(value)
      read()
    })
  }
  read()

  return [transformStream.readable, transformStream2.readable]
}

export function chainStreams<T>(
  streams: ReadableStream<T>[]
): ReadableStream<T> {
  const { readable, writable } = new TransformStream()

  let promise = Promise.resolve()
  for (let i = 0; i < streams.length; ++i) {
    promise = promise.then(() =>
      streams[i].pipeTo(writable, { preventClose: i + 1 < streams.length })
    )
  }

  return readable
}

export function streamFromArray(strings: string[]): ReadableStream<Uint8Array> {
  // Note: we use a TransformStream here instead of instantiating a ReadableStream
  // because the built-in ReadableStream polyfill runs strings through TextEncoder.
  const { readable, writable } = new TransformStream()

  const writer = writable.getWriter()
  strings.forEach((str) => writer.write(encodeText(str)))
  writer.close()

  return readable
}

export async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader()
  const textDecoder = new TextDecoder()

  let bufferedString = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      return bufferedString
    }

    bufferedString += decodeText(value, textDecoder)
  }
}

export function createBufferedTransformStream(
  transform: (v: string) => string | Promise<string> = (v) => v
): TransformStream<Uint8Array, Uint8Array> {
  let bufferedString = ''
  let pendingFlush: Promise<void> | null = null

  const flushBuffer = (controller: TransformStreamDefaultController) => {
    if (!pendingFlush) {
      pendingFlush = new Promise((resolve) => {
        setTimeout(async () => {
          const buffered = await transform(bufferedString)
          controller.enqueue(encodeText(buffered))
          bufferedString = ''
          pendingFlush = null
          resolve()
        }, 0)
      })
    }
    return pendingFlush
  }

  const textDecoder = new TextDecoder()

  return new TransformStream({
    transform(chunk, controller) {
      bufferedString += decodeText(chunk, textDecoder)
      flushBuffer(controller)
    },

    flush() {
      if (pendingFlush) {
        return pendingFlush
      }
    },
  })
}

export function createInsertedHTMLStream(
  getServerInsertedHTML: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    async transform(chunk, controller) {
      const insertedHTMLChunk = encodeText(await getServerInsertedHTML())

      controller.enqueue(insertedHTMLChunk)
      controller.enqueue(chunk)
    },
  })
}

export function renderToInitialStream({
  ReactDOMServer,
  element,
  streamOptions,
}: {
  ReactDOMServer: any
  element: React.ReactElement
  streamOptions?: any
}): Promise<ReactReadableStream> {
  return getTracer().trace(AppRenderSpan.renderToReadableStream, async () =>
    ReactDOMServer.renderToReadableStream(element, streamOptions)
  )
}

function createHeadInsertionTransformStream(
  insert: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  let inserted = false
  let freezing = false
  const textDecoder = new TextDecoder()

  return new TransformStream({
    async transform(chunk, controller) {
      // While react is flushing chunks, we don't apply insertions
      if (freezing) {
        controller.enqueue(chunk)
        return
      }

      const insertion = await insert()
      if (inserted) {
        controller.enqueue(encodeText(insertion))
        controller.enqueue(chunk)
        freezing = true
      } else {
        const content = decodeText(chunk, textDecoder)
        const index = content.indexOf('</head>')
        if (index !== -1) {
          const insertedHeadContent =
            content.slice(0, index) + insertion + content.slice(index)
          controller.enqueue(encodeText(insertedHeadContent))
          freezing = true
          inserted = true
        }
      }

      if (!inserted) {
        controller.enqueue(chunk)
      } else {
        queueTask(() => {
          freezing = false
        })
      }
    },
  })
}

// Suffix after main body content - scripts before </body>,
// but wait for the major chunks to be enqueued.
export function createDeferredSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  let suffixFlushed = false
  let suffixFlushTask: Promise<void> | null = null

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      if (!suffixFlushed && suffix) {
        suffixFlushed = true
        suffixFlushTask = new Promise((res) => {
          // NOTE: streaming flush
          // Enqueue suffix part before the major chunks are enqueued so that
          // suffix won't be flushed too early to interrupt the data stream
          setTimeout(() => {
            controller.enqueue(encodeText(suffix))
            res()
          })
        })
      }
    },
    flush(controller) {
      if (suffixFlushTask) return suffixFlushTask
      if (!suffixFlushed && suffix) {
        suffixFlushed = true
        controller.enqueue(encodeText(suffix))
      }
    },
  })
}

export function createInlineDataStream(
  dataStream: ReadableStream<Uint8Array>
): TransformStream<Uint8Array, Uint8Array> {
  let dataStreamFinished: Promise<void> | null = null
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      if (!dataStreamFinished) {
        const dataStreamReader = dataStream.getReader()

        // NOTE: streaming flush
        // We are buffering here for the inlined data stream because the
        // "shell" stream might be chunkenized again by the underlying stream
        // implementation, e.g. with a specific high-water mark. To ensure it's
        // the safe timing to pipe the data stream, this extra tick is
        // necessary.
        dataStreamFinished = new Promise((res) =>
          setTimeout(async () => {
            try {
              while (true) {
                const { done, value } = await dataStreamReader.read()
                if (done) {
                  return res()
                }
                controller.enqueue(value)
              }
            } catch (err) {
              controller.error(err)
            }
            res()
          }, 0)
        )
      }
    },
    flush() {
      if (dataStreamFinished) {
        return dataStreamFinished
      }
    },
  })
}

export function createSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    flush(controller) {
      if (suffix) {
        controller.enqueue(encodeText(suffix))
      }
    },
  })
}

export function createRootLayoutValidatorStream(
  assetPrefix = '',
  getTree: () => FlightRouterState
): TransformStream<Uint8Array, Uint8Array> {
  let foundHtml = false
  let foundBody = false
  const textDecoder = new TextDecoder()

  return new TransformStream({
    async transform(chunk, controller) {
      if (!foundHtml || !foundBody) {
        const content = decodeText(chunk, textDecoder)
        if (!foundHtml && content.includes('<html')) {
          foundHtml = true
        }
        if (!foundBody && content.includes('<body')) {
          foundBody = true
        }
      }
      controller.enqueue(chunk)
    },
    flush(controller) {
      const missingTags = [
        foundHtml ? null : 'html',
        foundBody ? null : 'body',
      ].filter(nonNullable)

      if (missingTags.length > 0) {
        controller.enqueue(
          encodeText(
            `<script>self.__next_root_layout_missing_tags_error=${JSON.stringify(
              { missingTags, assetPrefix: assetPrefix ?? '', tree: getTree() }
            )}</script>`
          )
        )
      }
    },
  })
}

export async function continueFromInitialStream(
  renderStream: ReactReadableStream,
  {
    suffix,
    dataStream,
    generateStaticHTML,
    getServerInsertedHTML,
    serverInsertedHTMLToHead,
    validateRootLayout,
  }: {
    suffix?: string
    dataStream?: ReadableStream<Uint8Array>
    generateStaticHTML: boolean
    getServerInsertedHTML?: () => Promise<string>
    serverInsertedHTMLToHead: boolean
    validateRootLayout?: {
      assetPrefix?: string
      getTree: () => FlightRouterState
    }
  }
): Promise<ReadableStream<Uint8Array>> {
  const closeTag = '</body></html>'
  const suffixUnclosed = suffix ? suffix.split(closeTag)[0] : null

  if (generateStaticHTML) {
    await renderStream.allReady
  }

  const transforms: Array<TransformStream<Uint8Array, Uint8Array>> = [
    createBufferedTransformStream(),
    getServerInsertedHTML && !serverInsertedHTMLToHead
      ? createInsertedHTMLStream(getServerInsertedHTML)
      : null,
    suffixUnclosed != null ? createDeferredSuffixStream(suffixUnclosed) : null,
    dataStream ? createInlineDataStream(dataStream) : null,
    suffixUnclosed != null ? createSuffixStream(closeTag) : null,
    createHeadInsertionTransformStream(async () => {
      // TODO-APP: Insert server side html to end of head in app layout rendering, to avoid
      // hydration errors. Remove this once it's ready to be handled by react itself.
      const serverInsertedHTML =
        getServerInsertedHTML && serverInsertedHTMLToHead
          ? await getServerInsertedHTML()
          : ''
      return serverInsertedHTML
    }),
    validateRootLayout
      ? createRootLayoutValidatorStream(
          validateRootLayout.assetPrefix,
          validateRootLayout.getTree
        )
      : null,
  ].filter(nonNullable)

  return transforms.reduce(
    (readable, transform) => readable.pipeThrough(transform),
    renderStream
  )
}
