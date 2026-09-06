/* eslint-env jest */
import type { AddressInfo } from 'node:net'

import http from 'node:http'
import zlib from 'node:zlib'
import setupCompression from 'next/dist/compiled/compression'

import { releaseCompressionStream } from './release-compression-stream'

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

function createServer({ release }: { release: boolean }) {
  const compress = setupCompression()

  return http.createServer((req, res) => {
    // @ts-expect-error not express req/res
    compress(req, res, () => {})

    if (release) {
      res.once('close', () => {
        if (res.writableFinished) return

        releaseCompressionStream(res)
      })
    }

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

    // Let the response's `close` event run.
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(true)
  })

  it('is still needed by the vendored compression middleware', async () => {
    // If this starts failing, the vendored `compression` handles premature close
    // itself and `releaseCompressionStream` can be removed.
    server = createServer({ release: false })
    const url = await listen(server)

    await requestThenDisconnect(url)

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(tracker.records).toHaveLength(1)
    expect(tracker.records[0].closed).toBe(false)
  })

  it('does not affect responses that complete normally', async () => {
    server = createServer({ release: true })
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

  it('is a no-op when compression is not active for the response', async () => {
    const compress = setupCompression()
    // Asserted in the test body so a failure isn't swallowed by the callback.
    const outcome: { threw: unknown; drainListeners: number } = {
      threw: null,
      drainListeners: -1,
    }

    server = http.createServer((req, res) => {
      // @ts-expect-error not express req/res
      compress(req, res, () => {})
      // `application/octet-stream` is not compressible, so no zlib stream is
      // created and there is nothing to release.
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
    // Cleanup must not leave a stray listener behind on the response.
    expect(outcome.drainListeners).toBe(0)
  })
})
