import { errorMonitor } from 'events'
import type { IncomingMessage } from 'http'
import { Readable } from 'stream'
import { getCloneableBody } from 'next/dist/server/body-streams'
import { getRequestMeta } from 'next/dist/server/request-meta'

function mockIncoming(body: string): IncomingMessage {
  const readable = new Readable({ read() {} })
  process.nextTick(() => {
    readable.push(Buffer.from(body))
    readable.push(null)
  })
  return readable as unknown as IncomingMessage
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function readAllWeb(stream: Readable, timeoutMs = 1000): Promise<Buffer> {
  let timeout: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Timed out reading stream via Readable.toWeb()'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      (async () => {
        const web = Readable.toWeb(stream)
        const reader = web.getReader()
        const out: Buffer[] = []

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          out.push(Buffer.from(value))
        }

        return Buffer.concat(out)
      })(),
      timeoutPromise,
    ])
  } finally {
    clearTimeout(timeout!)
  }
}

describe('getCloneableBody', () => {
  it.each([
    { chunks: [], limit: 10, size: 0 },
    { chunks: ['hello'], limit: 10, size: 5 },
    { chunks: ['hello', 'world'], limit: 10, size: 10 },
    // The overflowing chunk is dropped whole, so the retained size is less
    // than the limit. It cannot be derived from the limit or Content-Length.
    { chunks: ['1234', '5678', '9012'], limit: 10, size: 8 },
    { chunks: ['too large'], limit: 3, size: 0 },
  ])(
    'records the exact replay size for $chunks',
    async ({ chunks, limit, size }) => {
      const req = new Readable({ read() {} }) as IncomingMessage
      const cloneable = getCloneableBody(req, limit)
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const copy = cloneable.cloneBodyStream()
        for (const chunk of chunks) req.push(Buffer.from(chunk))
        req.push(null)
        expect((await readAll(copy)).length).toBe(size)
        await cloneable.finalize()
        expect(getRequestMeta(req, 'replayBodySize')).toBe(size)
        expect((await readAll(req)).length).toBe(size)
      } finally {
        warning.mockRestore()
      }
    }
  )

  it('does not record a replay size without cloning the body', async () => {
    const req = mockIncoming('untouched')
    await getCloneableBody(req).finalize()
    expect(getRequestMeta(req, 'replayBodySize')).toBeUndefined()
    expect((await readAll(req)).toString()).toBe('untouched')
  })

  it('delivers body events to the original listeners once', async () => {
    const req = mockIncoming('hello')
    const data = jest.fn()
    const end = jest.fn()
    req.on('data', data)
    req.on('end', end)

    const cloneable = getCloneableBody(req)
    expect((await readAll(cloneable.cloneBodyStream())).toString()).toBe(
      'hello'
    )
    await cloneable.finalize()

    expect((await readAll(req)).toString()).toBe('hello')
    expect(data.mock.calls).toEqual([[Buffer.from('hello')]])
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('keeps the request error listeners, monitor and listener limit', async () => {
    const req = mockIncoming('hello')
    const first = new Error('first')
    const second = new Error('second')
    const observations: string[] = []
    const monitor = jest.fn(() => observations.push('monitor'))
    const listener = jest.fn(() => observations.push('listener'))
    const onceListener = jest.fn(() => observations.push('once'))
    const removedListener = jest.fn()
    req.setMaxListeners(20)
    req.on(errorMonitor, monitor)
    req.on('error', listener)
    req.prependOnceListener('error', onceListener)
    req.once('error', removedListener)
    const originalErrorListeners = req.rawListeners('error')

    const cloneable = getCloneableBody(req)
    await readAll(cloneable.cloneBodyStream())
    await cloneable.finalize()

    expect(req.getMaxListeners()).toBe(20)
    expect(req.rawListeners('error')).toEqual(originalErrorListeners)
    req.off('error', removedListener)
    req.emit('error', first)
    req.emit('error', second)
    expect(observations).toEqual([
      'monitor',
      'once',
      'listener',
      'monitor',
      'listener',
    ])
    expect(onceListener.mock.calls).toEqual([[first]])
    expect(listener.mock.calls).toEqual([[first], [second]])
    expect(removedListener).not.toHaveBeenCalled()
    expect(monitor.mock.contexts).toEqual([req, req])
    expect(listener.mock.contexts).toEqual([req, req])
    expect(onceListener.mock.contexts).toEqual([req])
    req.off(errorMonitor, monitor)
    req.off('error', listener)
    expect(req.listenerCount(errorMonitor)).toBe(0)
    expect(req.listenerCount('error')).toBe(0)
  })

  it('keeps listeners and bound methods stable when finalizing twice', async () => {
    const req = mockIncoming('hello')
    const monitor = jest.fn()
    const listener = jest.fn()
    const onceListener = jest.fn()
    req.on(errorMonitor, monitor)
    req.on('error', listener)
    req.once('error', onceListener)

    const cloneable = getCloneableBody(req)
    await readAll(cloneable.cloneBodyStream())
    await cloneable.finalize()
    const { emit, read } = req
    await cloneable.finalize()

    const first = new Error('first')
    const second = new Error('second')
    emit('error', first)
    emit('error', second)
    expect(monitor.mock.calls).toEqual([[first], [second]])
    expect(listener.mock.calls).toEqual([[first], [second]])
    expect(onceListener.mock.calls).toEqual([[first]])
    expect(req.emit).toBe(emit)
    expect(req.read).toBe(read)
    expect(read()?.toString()).toBe('hello')
  })

  it('tracks the latest clone without double-counting or finalizing before it finishes', async () => {
    const req = mockIncoming('hello world')
    const cloneable = getCloneableBody(req)
    expect((await readAll(cloneable.cloneBodyStream())).toString()).toBe(
      'hello world'
    )
    await cloneable.finalize()

    // The original request has already ended, but the next clone still needs
    // to finish replaying before its size can be recorded.
    const copy = cloneable.cloneBodyStream()
    await cloneable.finalize()
    expect(getRequestMeta(req, 'replayBodySize')).toBe(11)
    expect((await readAll(copy)).toString()).toBe('hello world')

    // Routing may attach a new CloneableBody to the same request.
    const nextCloneable = getCloneableBody(req)
    await nextCloneable.finalize()
    expect(getRequestMeta(req, 'replayBodySize')).toBe(11)
    expect((await readAll(nextCloneable.cloneBodyStream())).toString()).toBe(
      'hello world'
    )
    await nextCloneable.finalize()
    expect(getRequestMeta(req, 'replayBodySize')).toBe(11)
    expect((await readAll(req)).toString()).toBe('hello world')
  })

  // Regression test for https://github.com/vercel/next.js/issues/95335
  //
  // After middleware clones the request body and `finalize()` swaps the buffered
  // stream back onto the request, the request must stay a plain Readable. The
  // buffered stream used to be a Duplex (PassThrough) whose writable-side
  // internals (`_writableState`, `write`, `end`, ...) were copied onto the
  // IncomingMessage, so a downstream handler reading a POST body via
  // `Readable.toWeb()` saw an unfinished writable side and hung forever.
  it('leaves the finalized request body consumable via Readable.toWeb()', async () => {
    const body = 'hello world'
    const req = mockIncoming(body)

    const cloneable = getCloneableBody(req)
    const middlewareCopy = cloneable.cloneBodyStream()

    // Middleware consumes its own copy of the body (e.g. via NextResponse.next()).
    expect((await readAll(middlewareCopy)).toString()).toBe(body)

    await cloneable.finalize()

    // The request must not masquerade as a writable stream after finalize.
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    expect((req as any)._writableState).toBeUndefined()
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    expect((req as any).write).toBeUndefined()
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    expect((req as any).end).toBeUndefined()
    expect((await readAllWeb(req as unknown as Readable)).toString()).toBe(body)
  })
})
