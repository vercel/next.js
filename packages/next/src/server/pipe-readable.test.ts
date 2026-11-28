/* eslint-env jest */
/**
 * @jest-environment node
 */
import type { AddressInfo } from 'node:net'

import { EventEmitter } from 'node:events'
import http from 'node:http'
import zlib from 'node:zlib'
import { PassThrough, Readable } from 'node:stream'
import { promisify } from 'node:util'
import setupCompression from 'next/dist/compiled/compression'

import {
  pipeNodeReadableToNodeResponse,
  streamToNodeResponse,
} from './pipe-readable'
import { ClientComponentLoadTracker } from './client-component-renderer-logger'

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

function createServer(
  pipe: (readable: Readable, res: http.ServerResponse) => Promise<void>
) {
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

    void pipe(readable, res)
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

describe.each([
  {
    name: 'pipeNodeReadableToNodeResponse',
    pipe: pipeNodeReadableToNodeResponse,
  },
  {
    name: 'streamToNodeResponse',
    pipe: (readable: Readable, res: http.ServerResponse) =>
      streamToNodeResponse(
        Readable.toWeb(readable) as ReadableStream<Uint8Array>,
        res
      ),
  },
])('$name', ({ pipe }) => {
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
    server = createServer(pipe)
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

it('cancels the producer and releases listeners when a response write fails', async () => {
  const failure = new Error('write failed')
  const cancel = jest.fn()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('first'))
    },
    cancel,
  })
  const response = Object.assign(new EventEmitter(), {
    req: { method: 'GET' },
    statusCode: 200,
    write() {
      throw failure
    },
    destroy: jest.fn(),
  }) as unknown as http.ServerResponse

  await expect(streamToNodeResponse(readable, response)).rejects.toThrow(
    'failed to pipe response'
  )
  expect(response.destroy).toHaveBeenCalledWith(failure)
  expect(cancel).toHaveBeenCalledWith(failure)
  expect(readable.locked).toBe(false)
  expect(response.listenerCount('drain')).toBe(0)
  expect(response.listenerCount('close')).toBe(0)
})

describe('streamToNodeResponse lifecycle', () => {
  let server: http.Server

  function serve(readable: ReadableStream<Uint8Array>, statusCode = 200) {
    return new Promise<unknown>((resolve) => {
      server = http.createServer((_req, res) => {
        res.statusCode = statusCode
        void streamToNodeResponse(readable, res).then(
          () => resolve(undefined),
          resolve
        )
      })
    })
  }

  afterEach(async () => {
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('ends empty responses and releases the reader', async () => {
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    const completed = serve(readable)
    const response = await fetch(await listen(server))

    expect(await response.text()).toBe('')
    expect(await completed).toBeUndefined()
    expect(readable.locked).toBe(false)
  })

  it.each([
    { method: 'HEAD', statusCode: 200 },
    { method: 'GET', statusCode: 204 },
    { method: 'GET', statusCode: 304 },
  ])(
    'sends $method $statusCode headers before the producer closes',
    async ({ method, statusCode }) => {
      let closeProducer: () => void
      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          closeProducer = () => controller.close()
          controller.enqueue(new TextEncoder().encode('first'))
        },
      })
      const completed = serve(readable, statusCode)
      const url = await listen(server)
      const receivedStatus = await new Promise<number | undefined>(
        (resolve, reject) => {
          const request = http.request(
            url,
            { method, signal: AbortSignal.timeout(5000) },
            (response) => {
              // Completing the producer requires receiving headers first.
              closeProducer()
              response.resume()
              response.on('end', () => resolve(response.statusCode))
              response.on('error', reject)
            }
          )
          request.on('error', reject)
          request.end()
        }
      )

      expect(receivedStatus).toBe(statusCode)
      expect(await completed).toBeUndefined()
      expect(readable.locked).toBe(false)
    }
  )

  it('delivers chunks before the producer finishes', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array>
    const readable = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
        controller.enqueue(new TextEncoder().encode('first'))
      },
    })
    const completed = serve(readable)
    const url = await listen(server)
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get(url, (res) => {
          let text = ''
          res.on('data', (chunk) => {
            text += chunk.toString()
            if (text === 'first') {
              controller.enqueue(new TextEncoder().encode('second'))
              controller.close()
            }
          })
          res.on('end', () => resolve(text))
          res.on('error', reject)
        })
        .on('error', reject)
    })

    expect(body).toBe('firstsecond')
    expect(await completed).toBeUndefined()
    expect(readable.locked).toBe(false)
  })

  it('cancels the producer when the client disconnects', async () => {
    let onCancel: (reason: unknown) => void
    const cancelled = new Promise<unknown>((resolve) => {
      onCancel = resolve
    })
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'))
      },
      cancel(reason) {
        onCancel(reason)
      },
    })
    const completed = serve(readable)
    const url = await listen(server)
    await new Promise<void>((resolve, reject) => {
      http
        .get(url, (res) => {
          res.once('data', () => {
            res.destroy()
            resolve()
          })
          res.on('error', () => {})
        })
        .on('error', reject)
    })

    expect(await cancelled).toMatchObject({ name: 'ResponseAborted' })
    expect(await completed).toBeUndefined()
    expect(readable.locked).toBe(false)
  })

  it('terminates a streamed response when the producer errors', async () => {
    const failure = new Error('producer failed')
    let fail!: () => void
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        fail = () => controller.error(failure)
        controller.enqueue(new TextEncoder().encode('first'))
      },
    })
    const completed = serve(readable)
    const url = await listen(server)
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get(url, (res) => {
          let text = ''
          res.on('data', (chunk) => {
            text += chunk.toString()
            if (text === 'first') fail()
          })
          res.on('aborted', () => resolve(text))
          res.on('error', () => {})
        })
        .on('error', reject)
    })

    expect(body).toBe('first')
    expect(await completed).toMatchObject({
      message: 'failed to pipe response',
      cause: failure,
    })
    expect(readable.locked).toBe(false)
  })
})

describe('client component loading measurement at first write', () => {
  let server: http.Server | undefined
  let measure: jest.SpyInstance
  let pipe: typeof import('./pipe-readable')
  const previousPrefix = process.env.NEXT_OTEL_PERFORMANCE_PREFIX

  beforeAll(() => {
    process.env.NEXT_OTEL_PERFORMANCE_PREFIX = 'test'
    jest.isolateModules(() => {
      pipe = require('./pipe-readable') as typeof import('./pipe-readable')
    })
  })

  afterAll(() => {
    if (previousPrefix === undefined) {
      delete process.env.NEXT_OTEL_PERFORMANCE_PREFIX
    } else {
      process.env.NEXT_OTEL_PERFORMANCE_PREFIX = previousPrefix
    }
  })

  beforeEach(() => {
    measure = jest.spyOn(performance, 'measure').mockImplementation(() => {
      return {} as PerformanceMeasure
    })
  })

  afterEach(async () => {
    measure.mockRestore()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  it.each(['web', 'node'] as const)(
    'measures the explicit %s tracker when the first chunk is written',
    async (streamKind) => {
      const tracker = new ClientComponentLoadTracker()
      tracker.beginRequire(100)
      tracker.finishRequire(100, 115)
      tracker.beginRequire(150)
      tracker.finishRequire(150, 160)
      tracker.beginChunk(200)
      const firstWrite = new Promise<void>((resolve) => {
        measure.mockImplementation(() => {
          resolve()
          return {} as PerformanceMeasure
        })
      })

      function loadAfterFirstWrite() {
        tracker.beginRequire(300)
        tracker.finishRequire(300, 330)
      }

      server = http.createServer((_req, res) => {
        if (streamKind === 'web') {
          const readable = new ReadableStream<Uint8Array>({
            start(controller) {
              setImmediate(() => {
                tracker.finishChunk(200, 250)
                controller.enqueue(new TextEncoder().encode('hello'))
                void firstWrite.then(() => {
                  loadAfterFirstWrite()
                  controller.enqueue(new TextEncoder().encode(' world'))
                  controller.close()
                })
              })
            },
          })
          void pipe
            .pipeToNodeResponse(readable, res, undefined, tracker)
            .catch((error) => res.destroy(error))
        } else {
          const readable = new PassThrough()
          void pipe
            .pipeNodeReadableToNodeResponse(readable, res, undefined, tracker)
            .catch((error) => res.destroy(error))
          setImmediate(() => {
            tracker.finishChunk(200, 250)
            readable.write('hello')
            void firstWrite.then(() => {
              loadAfterFirstWrite()
              readable.end(' world')
            })
          })
        }
      })

      const url = await listen(server)
      expect(await (await fetch(url)).text()).toBe('hello world')
      expect(measure).toHaveBeenCalledTimes(1)
      expect(measure).toHaveBeenCalledWith(
        'test:next-client-component-loading',
        { start: 100, end: 175 }
      )
    }
  )
})
