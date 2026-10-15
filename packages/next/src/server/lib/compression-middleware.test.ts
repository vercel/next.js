/* eslint-env jest */
import type { AddressInfo } from 'node:net'

import http from 'node:http'
import zlib from 'node:zlib'
import setupCompression from 'next/dist/compiled/compression'

type StreamRecord = { closed: boolean }

/** Records every zlib stream the middleware creates, and whether it closed. */
function trackCompressionStreams(): {
  records: StreamRecord[]
  restore: () => void
} {
  const records: StreamRecord[] = []
  const originals: Array<[string, unknown]> = []

  for (const name of ['createGzip', 'createDeflate'] as const) {
    const original = zlib[name]
    originals.push([name, original])
    // zlib's exports are non-writable, so they have to be redefined.
    Object.defineProperty(zlib, name, {
      configurable: true,
      writable: true,
      value: (...args: Parameters<typeof original>) => {
        const stream = original(...args)
        const record: StreamRecord = { closed: false }
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

function createServer() {
  const compress = setupCompression()

  return http.createServer((req, res) => {
    // @ts-expect-error not express req/res
    compress(req, res, () => {})

    if (req.url === '/complete') {
      res.setHeader('content-type', 'text/html')
      res.end(`<html><body>${'x'.repeat(4096)}</body></html>`)
      return
    }

    res.setHeader('content-type', 'text/html')
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

/** Reads the first chunk, then disconnects mid-response. */
async function requestThenDisconnect(url: string) {
  const res = await fetch(url, {
    headers: { 'accept-encoding': 'gzip' },
    signal: AbortSignal.timeout(10_000),
  })
  const reader = res.body!.getReader()
  await reader.read()
  await reader.cancel()
}

// The vendored `compression` middleware (>= 1.8.2, GHSA-vc2v-76pw-4v95) must
// destroy its zlib stream when the client disconnects before the response
// finishes. An open zlib stream is pinned by its native handle and survives GC,
// permanently retaining ~256 KiB of deflate state per aborted response.
describe('vendored compression middleware', () => {
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
    server = createServer()
    const url = await listen(server)

    await requestThenDisconnect(url)

    // Let the response's `close` event run.
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })

  it('still compresses and releases responses that complete normally', async () => {
    server = createServer()
    const url = await listen(server)

    const res = await fetch(`${url}/complete`, {
      headers: { 'accept-encoding': 'gzip' },
      signal: AbortSignal.timeout(10_000),
    })

    expect(res.headers.get('content-encoding')).toBe('gzip')
    // `fetch` decompresses, so this verifies the payload survived intact.
    expect(await res.text()).toBe(
      `<html><body>${'x'.repeat(4096)}</body></html>`
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })
})
