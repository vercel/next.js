/**
 * @jest-environment node
 */

import { context, trace } from '@opentelemetry/api'
import { PassThrough } from 'node:stream'

import { MockedResponse } from './lib/mock-request'
import {
  NextNodeServerSpan,
  NextVanillaSpanAllowlist,
} from './lib/trace/constants'
import { registerLocalSpanRecorder } from './lib/trace/local-span-recorder'
import {
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './lib/trace/span-store'
import {
  pipeNodeReadableToNodeResponse,
  pipeToNodeResponse,
} from './pipe-readable'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalOtelVerbose = process.env.NEXT_OTEL_VERBOSE
const spanRecords: SpanStoreRecord[] = []

function getFirstResponseChunkSpans() {
  return spanRecords.filter(
    (span) =>
      span.attributes?.['next.span_type'] ===
      'NextNodeServer.waitForFirstResponseChunk'
  )
}

function createPendingWebStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const readable = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })

  return { controller, readable }
}

describe('first response chunk tracing', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    process.env.NEXT_OTEL_VERBOSE = '1'
    setSpanRecorderForTest((span) => spanRecords.push(span))
    registerLocalSpanRecorder()
  })

  afterEach(() => {
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    if (originalOtelVerbose === undefined) {
      delete process.env.NEXT_OTEL_VERBOSE
    } else {
      process.env.NEXT_OTEL_VERBOSE = originalOtelVerbose
    }
    context.disable()
    trace.disable()
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('keeps first response chunk timing out of default OpenTelemetry output', () => {
    expect(
      NextVanillaSpanAllowlist.has(NextNodeServerSpan.waitForFirstResponseChunk)
    ).toBe(false)
  })

  it('does not record first response chunk timing when internal tracing is disabled', async () => {
    delete process.env.NEXT_OTEL_VERBOSE
    const response = new MockedResponse()
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    await pipeToNodeResponse(readable, response)

    expect(getFirstResponseChunkSpans()).toEqual([])
  })

  it('finishes when a Web stream writes its first chunk', async () => {
    const response = new MockedResponse()
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'))
        controller.enqueue(new TextEncoder().encode('second'))
        controller.close()
      },
    })

    await pipeToNodeResponse(readable, response)

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        name: 'wait for first response chunk',
        status: 'ok',
      }),
    ])
  })

  it('finishes cleanly when a Web stream closes without a chunk', async () => {
    const response = new MockedResponse()
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    await pipeToNodeResponse(readable, response)

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({ status: 'ok' }),
    ])
  })

  it('records a Web stream error before its first chunk', async () => {
    const response = new MockedResponse()
    const error = new TypeError('web stream failed')
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error)
      },
    })

    await expect(pipeToNodeResponse(readable, response)).rejects.toThrow(
      'failed to pipe response'
    )

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          type: 'TypeError',
          message: error.message,
        }),
      }),
    ])
  })

  it('records a Web stream abort before its first chunk', async () => {
    const response = new MockedResponse()
    const error = new Error('web stream aborted')
    error.name = 'AbortError'
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error)
      },
    })

    await pipeToNodeResponse(readable, response)

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          type: 'AbortError',
          message: error.message,
        }),
      }),
    ])
  })

  it('records a Web response closing before its first chunk', async () => {
    const response = new MockedResponse()
    const { readable } = createPendingWebStream()
    const piping = pipeToNodeResponse(readable, response)

    response.destroy()
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          type: 'ResponseAborted',
          message: 'Response closed before its first chunk',
        }),
      }),
    ])
  })

  it('does not replace Web first-chunk success with a later error', async () => {
    const { controller, readable } = createPendingWebStream()
    let writtenChunk: string | undefined
    const response = new MockedResponse({
      resWriter(chunk) {
        writtenChunk = Buffer.from(chunk).toString()
        controller.error(new Error('failed after first chunk'))
        return true
      },
    })
    const piping = pipeToNodeResponse(readable, response)

    controller.enqueue(new TextEncoder().encode('first'))
    await expect(piping).rejects.toThrow('failed to pipe response')

    expect(writtenChunk).toBe('first')
    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({ status: 'ok' }),
    ])
  })

  it('finishes when a Node stream emits its first chunk', async () => {
    const response = new MockedResponse()
    const readable = new PassThrough()
    const piping = pipeNodeReadableToNodeResponse(readable, response)

    readable.write('first')
    readable.end('second')
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        name: 'wait for first response chunk',
        status: 'ok',
      }),
    ])
  })

  it('finishes cleanly when a Node stream ends without a chunk', async () => {
    const response = new MockedResponse()
    const readable = new PassThrough()
    const piping = pipeNodeReadableToNodeResponse(readable, response)

    readable.end()
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({ status: 'ok' }),
    ])
  })

  it('records a Node stream error before its first chunk', async () => {
    const response = new MockedResponse()
    void response.hasStreamed.catch(() => {})
    const readable = new PassThrough()
    const piping = pipeNodeReadableToNodeResponse(readable, response)
    const error = new TypeError('node stream failed')

    readable.destroy(error)
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          type: 'TypeError',
          message: error.message,
        }),
      }),
    ])
  })

  it('records a Node response closing before its first chunk', async () => {
    const response = new MockedResponse()
    const readable = new PassThrough()
    const piping = pipeNodeReadableToNodeResponse(readable, response)

    response.destroy()
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          type: 'ResponseAborted',
          message: 'Response closed before its first chunk',
        }),
      }),
    ])
  })

  it('does not replace Node first-chunk success with a later error', async () => {
    const response = new MockedResponse()
    void response.hasStreamed.catch(() => {})
    const readable = new PassThrough()
    const piping = pipeNodeReadableToNodeResponse(readable, response)

    readable.write('first')
    readable.destroy(new Error('failed after first chunk'))
    await piping

    expect(getFirstResponseChunkSpans()).toEqual([
      expect.objectContaining({ status: 'ok' }),
    ])
  })
})
