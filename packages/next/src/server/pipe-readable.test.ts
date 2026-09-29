/* eslint-env jest */
/**
 * @jest-environment node
 */
import type { AddressInfo } from 'node:net'

import { EventEmitter } from 'node:events'
import http from 'node:http'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import setupCompression from 'next/dist/compiled/compression'

import { pipeNodeReadableToNodeResponse } from './pipe-readable'

const gunzip = promisify(zlib.gunzip)

// Large enough that the socket keeps applying backpressure to a slow reader,
// so `res.write()` returns `false` many more times than Node's listener limit.
const CHUNK_SIZE = 64 * 1024
const CHUNK_COUNT = 48
const FILL = 'x'.charCodeAt(0)

/**
 * Counts how many `drain` listeners get added to each zlib stream the
 * `compression` middleware creates. Counting registrations rather than sampling
 * `listenerCount` keeps the assertion deterministic: the middleware forwards
 * `res.on` to the stream but not `removeListener`, so anything added is there
 * to stay.
 */
function trackGzipDrainRegistrations(): {
  streams: number
  drainRegistrations: number
  restore: () => void
} {
  const state = { streams: 0, drainRegistrations: 0, restore: () => {} }
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
        state.streams++
        stream.on('newListener', (event) => {
          if (event === 'drain') state.drainRegistrations++
        })
        return stream
      },
    })
  }

  state.restore = () => {
    for (const [name, original] of originals) {
      Object.defineProperty(zlib, name, {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  }

  return state
}

function createServer() {
  const compress = setupCompression()

  return http.createServer((req, res) => {
    // @ts-expect-error not express req/res
    compress(req, res, () => {})
    res.setHeader('content-type', 'text/html')

    let sent = 0
    const readable = Readable.from(
      (function* () {
        while (sent++ < CHUNK_COUNT) {
          yield Buffer.alloc(CHUNK_SIZE, FILL)
        }
      })()
    )

    void pipeNodeReadableToNodeResponse(readable, res)
  })
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

/**
 * Reads the response a chunk at a time, pausing in between, so the server sees
 * sustained backpressure instead of draining immediately.
 */
async function readSlowly(url: string) {
  return new Promise<{ encoding?: string; body: Buffer }>((resolve, reject) => {
    const req = http.get(
      url,
      { headers: { 'accept-encoding': 'gzip' } },
      (res) => {
        const parts: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          parts.push(chunk)
          res.pause()
          setTimeout(() => res.resume(), 2)
        })
        res.on('end', () =>
          resolve({
            encoding: res.headers['content-encoding'],
            body: Buffer.concat(parts),
          })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
  })
}

describe('pipeNodeReadableToNodeResponse', () => {
  let tracker: ReturnType<typeof trackGzipDrainRegistrations>
  let server: http.Server | undefined
  let warnings: string[]
  let onWarning: (warning: Error) => void

  beforeEach(() => {
    tracker = trackGzipDrainRegistrations()
    warnings = []
    onWarning = (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        warnings.push(warning.message)
      }
    }
    process.on('warning', onWarning)
  })

  afterEach(async () => {
    process.off('warning', onWarning)
    tracker.restore()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  it('reuses one gzip drain listener across many backpressured writes', async () => {
    server = createServer()
    const url = await listen(server)

    const { encoding, body } = await readSlowly(url)

    expect(encoding).toBe('gzip')
    expect(tracker.streams).toBe(1)

    // Without reuse this is one registration per backpressured write, which
    // Node reports as a probable leak once it passes `defaultMaxListeners`.
    expect(tracker.drainRegistrations).toBe(1)
    expect(tracker.drainRegistrations).toBeLessThan(
      EventEmitter.defaultMaxListeners
    )
    expect(warnings).toEqual([])

    // The reused listener must still resume the readable, or the response
    // stalls partway through.
    const decompressed = await gunzip(body)
    expect(decompressed).toHaveLength(CHUNK_SIZE * CHUNK_COUNT)
    expect(decompressed.every((byte) => byte === FILL)).toBe(true)
  })
})
