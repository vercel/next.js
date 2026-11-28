import { EventEmitter } from 'events'
import { Readable } from 'stream'

jest.mock('../../packages/next/src/server/lib/trace/tracer', () => ({
  getTracer: () => ({
    trace: (_name: any, _opts: any, fn: any) => fn(),
    startSpan: () => ({ end: () => {} }),
  }),
}))
jest.mock(
  '../../packages/next/src/server/client-component-renderer-logger',
  () => ({
    getClientComponentLoaderMetrics: () => null,
  })
)

import { pipeNodeReadableToNodeResponse } from '../../packages/next/src/server/pipe-readable'

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

describe('pipeNodeReadableToNodeResponse waitUntilForEnd', () => {
  it('ends the response (and resolves) when waitUntilForEnd rejects', async () => {
    const readable = new Readable({
      read() {
        this.push(Buffer.from('data'))
        this.push(null)
      },
    })
    const res = createMockResponse()
    const failure = new Error('revalidation failed')

    // Must not raise an unhandled rejection or hang — the response is ended
    // normally (the body was already fully written).
    await pipeNodeReadableToNodeResponse(
      readable,
      res,
      Promise.reject(failure)
    )
    expect(res.writableFinished).toBe(true)
    expect(res.destroyed).toBe(false)
  })

  it('handles a waitUntilForEnd rejection that happens while still streaming', async () => {
    // The rejection lands before the stream ends; without an eager rejection
    // handler this becomes an unhandled rejection (process crash) before the
    // 'end' listener ever runs.
    let pushed = false
    const readable = new Readable({
      read() {
        if (!pushed) {
          pushed = true
          this.push(Buffer.from('x'))
        }
      },
    })
    const res = createMockResponse()
    const failure = new Error('early revalidation failure')

    const piping = pipeNodeReadableToNodeResponse(
      readable,
      res,
      Promise.reject(failure)
    )
    // The promise rejects while the stream is still open.
    await new Promise((resolve) => setImmediate(resolve))
    readable.push(null)

    await piping
    expect(res.writableFinished).toBe(true)
    expect(res.destroyed).toBe(false)
  })

  it('observes waitUntilForEnd even when the response is already destroyed', async () => {
    // Early return path: the response is already destroyed before piping, so
    // no stream listeners are attached. A rejecting waitUntilForEnd must
    // still be observed (no unhandled rejection).
    const res = createMockResponse()
    res.destroyed = true
    const failure = new Error('late revalidation failure')

    const unhandled: unknown[] = []
    const onUnhandled = (err: unknown) => unhandled.push(err)
    process.on('unhandledRejection', onUnhandled)
    try {
      await pipeNodeReadableToNodeResponse(
        new Readable({
          read() {
            this.push(null)
          },
        }),
        res,
        Promise.reject(failure)
      )
      // Let any unhandled rejection surface.
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).toEqual([])
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }
  })

  it('ends the response normally when waitUntilForEnd resolves', async () => {
    const readable = new Readable({
      read() {
        this.push(Buffer.from('data'))
        this.push(null)
      },
    })
    const res = createMockResponse()
    await pipeNodeReadableToNodeResponse(readable, res, Promise.resolve())
    expect(res.writableFinished).toBe(true)
    expect(res.destroyed).toBe(false)
  })
})
