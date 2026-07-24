/* eslint-env jest */
import type { AddressInfo, Socket } from 'node:net'

import http from 'node:http'
import zlib from 'node:zlib'
import setupCompression from 'next/dist/compiled/compression'

import { releaseCompressionStream } from './release-compression-stream'

type StreamRecord = {
  closed: boolean
  stream: zlib.Gzip | zlib.Deflate
}

function trackCompressionStreams(): {
  records: StreamRecord[]
  restore: () => void
} {
  const records: StreamRecord[] = []
  const originals: Array<[string, unknown]> = []

  for (const name of ['createGzip', 'createDeflate'] as const) {
    const original = zlib[name]
    originals.push([name, original])
    // Node's zlib exports are configurable but non-writable.
    Object.defineProperty(zlib, name, {
      configurable: true,
      writable: true,
      value: (...args: Parameters<typeof original>) => {
        const stream = original(...args)
        const record: StreamRecord = { closed: false, stream }
        stream.once('close', () => {
          record.closed = true
        })
        records.push(record)
        return stream
      },
    })
  }

  return {
    records,
    restore: () => {
      for (const record of records) {
        record.stream.destroy()
      }
      for (const [name, original] of originals) {
        Object.defineProperty(zlib, name, {
          configurable: true,
          writable: true,
          value: original,
        })
      }
    },
  }
}

function createServer({
  release,
  onLateRequest,
}: {
  release: boolean
  onLateRequest?: () => void
}) {
  const compress = setupCompression()

  return http.createServer((req, res) => {
    // @ts-expect-error not express req/res
    compress(req, res, () => {})

    if (release) {
      res.once('close', () => {
        if (!res.writableFinished) {
          releaseCompressionStream(res)
        }
      })
    }

    res.setHeader('content-type', 'text/html')

    if (req.url === '/late') {
      onLateRequest?.()
      setTimeout(() => {
        res.write(`<html><body>${'x'.repeat(4096)}`)
        ;(res as any).flush()
      }, 50)
      return
    }

    if (req.url === '/complete') {
      res.end(`<html><body>${'x'.repeat(4096)}</body></html>`)
      return
    }

    res.write(`<html><body>${'x'.repeat(4096)}`)
    // Flush so the client receives a chunk, then leave the response open.
    ;(res as any).flush()
  })
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

async function requestThenDisconnect(url: string) {
  const res = await fetch(url, {
    headers: { 'accept-encoding': 'gzip' },
    signal: AbortSignal.timeout(10_000),
  })
  const reader = res.body!.getReader()
  await reader.read()
  await reader.cancel()
}

describe('releaseCompressionStream', () => {
  let tracker: ReturnType<typeof trackCompressionStreams>
  let server: http.Server | undefined

  beforeEach(() => {
    tracker = trackCompressionStreams()
  })

  afterEach(async () => {
    tracker.restore()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  it('releases the zlib stream when the client disconnects mid-response', async () => {
    server = createServer({ release: true })
    const url = await listen(server)

    await requestThenDisconnect(url)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })

  it('is still needed by the vendored compression middleware', async () => {
    // If this starts failing, the middleware handles premature close itself and
    // releaseCompressionStream can be removed.
    server = createServer({ release: false })
    const url = await listen(server)

    await requestThenDisconnect(url)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(false)
  })

  it('releases a stream created after an early client disconnect', async () => {
    let signalRequestStarted!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      signalRequestStarted = resolve
    })
    server = createServer({
      release: true,
      onLateRequest: () => signalRequestStarted(),
    })
    const url = await listen(server)

    let socket!: Socket
    const socketAssigned = new Promise<void>((resolve) => {
      const request = http.get(`${url}/late`, {
        headers: { 'accept-encoding': 'gzip' },
      })
      request.on('error', () => {})
      request.once('socket', (assignedSocket) => {
        socket = assignedSocket
        resolve()
      })
    })

    await Promise.all([requestStarted, socketAssigned])
    socket.destroy()
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })

  it('does not affect responses that complete normally', async () => {
    server = createServer({ release: true })
    const url = await listen(server)

    const res = await fetch(`${url}/complete`, {
      headers: { 'accept-encoding': 'gzip' },
      signal: AbortSignal.timeout(10_000),
    })

    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(await res.text()).toBe(
      `<html><body>${'x'.repeat(4096)}</body></html>`
    )
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })

  it('is a no-op when compression is inactive for the response', async () => {
    const compress = setupCompression()
    const outcome = { threw: null as unknown, drainListeners: -1 }

    server = http.createServer((req, res) => {
      // @ts-expect-error not express req/res
      compress(req, res, () => {})
      res.setHeader('content-type', 'application/octet-stream')
      res.write('x'.repeat(4096))

      res.once('close', () => {
        try {
          releaseCompressionStream(res)
        } catch (err) {
          outcome.threw = err
        }
        outcome.drainListeners = res.listenerCount('drain')
      })
    })
    const url = await listen(server)

    await requestThenDisconnect(url)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(0)
    expect(outcome.threw).toBeNull()
    expect(outcome.drainListeners).toBe(0)
  })
})
