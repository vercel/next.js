import { EventEmitter } from 'events'
import { Readable } from 'stream'

// Mock the tracer/logger so the module loads without telemetry setup.
jest.mock('./lib/trace/tracer', () => ({
  getTracer: () => ({
    trace: (_name: any, _opts: any, fn: any) => fn(),
    startSpan: () => ({ end: () => {} }),
  }),
}))
jest.mock('./client-component-renderer-logger', () => ({
  getClientComponentLoaderMetrics: () => null,
}))

import { pipeNodeReadableToNodeResponse } from './pipe-readable'

function createMockResponse() {
  const res = new EventEmitter() as any
  res.errored = null
  res.destroyed = false
  res.writableFinished = false
  res.destroy = (err: any) => {
    res.destroyed = true
    res.destroyError = err
    res.emit('close')
  }
  res.write = () => true
  res.end = () => {
    res.writableFinished = true
    res.emit('close')
  }
  res.flushHeaders = () => {}
  return res
}

describe('pipeNodeReadableToNodeResponse', () => {
  it('destroys the response instead of hanging when the stream already errored', async () => {
    const readable = new Readable({ read() {} })
    const failure = new Error('failed before piping')
    // The stream errored while a previous consumer (e.g. a pipeline) still
    // had an error listener attached — its terminal state is retained in
    // `readable.errored`.
    readable.on('error', () => {})
    readable.destroy(failure)
    // Let the 'error' event actually fire before piping — this is the real
    // race: the consumer attaches after the stream already errored.
    await new Promise((resolve) => setImmediate(resolve))

    const res = createMockResponse()
    // Must resolve (not hang) and destroy the response with the stream error.
    await pipeNodeReadableToNodeResponse(readable, res)
    expect(res.destroyed).toBe(true)
    expect(res.destroyError).toBe(failure)
  })

  it('still pipes a healthy stream to the response', async () => {
    const readable = new Readable({
      read() {
        this.push(Buffer.from('hello'))
        this.push(null)
      },
    })
    const res = createMockResponse()
    const written: Buffer[] = []
    res.write = (chunk: Buffer) => {
      written.push(chunk)
      return true
    }
    await pipeNodeReadableToNodeResponse(readable, res)
    expect(Buffer.concat(written).toString()).toBe('hello')
    expect(res.writableFinished).toBe(true)
  })
})
