import { mkdtemp, writeFile, utimes } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createPerfettoTraceServer } from './perfetto'
import type { TraceEvent } from '../../trace/types'

interface FetchResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

function listenOnEphemeralPort(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

async function request(
  baseUrl: string,
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {}
): Promise<FetchResult> {
  const http = await import('node:http')
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      { method: init.method ?? 'GET', headers: init.headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function writeFixture(
  events: TraceEvent[][],
  dir?: string
): Promise<{ dir: string; filePath: string }> {
  const targetDir = dir ?? (await mkdtemp(join(tmpdir(), 'next-perfetto-cli-')))
  const filePath = join(targetDir, 'trace')
  await writeFile(
    filePath,
    events.map((line) => JSON.stringify(line)).join('\n') + '\n'
  )
  return { dir: targetDir, filePath }
}

describe('createPerfettoTraceServer', () => {
  let server: Server | undefined
  let baseUrl: string
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    if (server) {
      await closeServer(server)
      server = undefined
    }
  })

  it('serves the launcher HTML at /', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const res = await request(baseUrl, '/')

    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/html')
    const html = res.body.toString('utf8')
    expect(html).toContain('https://ui.perfetto.dev')
    expect(html).toContain(filePath)
    // Sanity check that the launcher renders the sessions list and fetches
    // it at load time.
    expect(html).toContain('id="sessions-container"')
    expect(html).toContain("fetch('/sessions.json'")
    expect(html).toContain("'/trace.json' + params")
  })

  it('serves the converted trace JSON at /trace.json with the correct headers', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
      [
        {
          name: 'child',
          id: 2,
          parentId: 1,
          timestamp: 10,
          duration: 50,
          startTime: 10,
        },
      ],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const res = await request(baseUrl, '/trace.json')

    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('application/json')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['last-modified']).toBeTruthy()
    // The launcher and trace endpoints are same-origin, so we explicitly do
    // NOT emit any CORS headers.
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.headers['content-length']).toBe(String(res.body.byteLength))

    const json = JSON.parse(res.body.toString('utf8'))
    expect(Array.isArray(json.traceEvents)).toBe(true)
    // 2 spans × 2 events (B + E) = 4 events.
    expect(json.traceEvents).toHaveLength(4)
    expect(json.traceEvents.map((e: { ph: string }) => e.ph)).toEqual([
      'B',
      'B',
      'E',
      'E',
    ])
  })

  it('responds to HEAD /trace.json with the same headers and no body', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const head = await request(baseUrl, '/trace.json', { method: 'HEAD' })
    const get = await request(baseUrl, '/trace.json')

    expect(head.status).toBe(200)
    expect(head.body.byteLength).toBe(0)
    expect(head.headers['content-length']).toBe(String(get.body.byteLength))
    expect(head.headers['last-modified']).toBe(get.headers['last-modified'])
  })

  it('returns 404 for unknown paths', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const res = await request(baseUrl, '/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('re-reads and re-converts the trace file when its mtime changes between requests', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'first', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const firstResponse = await request(baseUrl, '/trace.json')
    const firstJson = JSON.parse(firstResponse.body.toString('utf8'))
    expect(firstJson.traceEvents[0].name).toBe('first')

    // Rewrite the file with new content. Ensure the mtime advances even on
    // file systems with coarse mtime resolution by explicitly bumping it.
    await writeFile(
      filePath,
      JSON.stringify([{ name: 'second', id: 1, timestamp: 0, duration: 100 }]) +
        '\n'
    )
    const future = new Date(Date.now() + 5_000)
    await utimes(filePath, future, future)

    const secondResponse = await request(baseUrl, '/trace.json')
    const secondJson = JSON.parse(secondResponse.body.toString('utf8'))
    expect(secondJson.traceEvents[0].name).toBe('second')
    expect(secondResponse.headers['last-modified']).not.toBe(
      firstResponse.headers['last-modified']
    )
  })

  it('reuses the cached buffer when mtime and size are unchanged', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const a = await request(baseUrl, '/trace.json')
    const b = await request(baseUrl, '/trace.json')

    expect(a.body.equals(b.body)).toBe(true)
    expect(a.headers['last-modified']).toBe(b.headers['last-modified'])
  })

  it('returns 404 when the trace file disappears after the server started', async () => {
    const { filePath } = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    // Prime the cache, then delete the source file.
    await request(baseUrl, '/trace.json')
    const fs = await import('fs/promises')
    await fs.rm(filePath)

    const res = await request(baseUrl, '/trace.json')

    expect(res.status).toBe(404)
  })

  it('lists per-traceId sessions at /sessions.json', async () => {
    const { filePath } = await writeFixture([
      // Session A: one root + one child. The root carries a wall-clock
      // `startTime` (ms since epoch).
      [
        {
          name: 'next-build',
          id: 1,
          traceId: 'a',
          timestamp: 0,
          duration: 1_000,
          startTime: 1_700_000_000_000,
        },
      ],
      [
        {
          name: 'compile',
          id: 2,
          parentId: 1,
          traceId: 'a',
          timestamp: 100,
          duration: 500,
          startTime: 1_700_000_000_100,
        },
      ],
      // Session B: just a root, no wall-clock startTime.
      [
        {
          name: 'next-dev',
          id: 3,
          traceId: 'b',
          timestamp: 2_000,
          duration: 7_500,
        },
      ],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const res = await request(baseUrl, '/sessions.json')
    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('application/json')

    const sessions = JSON.parse(res.body.toString('utf8'))
    expect(sessions).toEqual([
      {
        traceId: 'a',
        name: 'next-build',
        startTime: 0,
        wallClockStartTime: 1_700_000_000_000,
        duration: 1_000,
        eventCount: 2,
      },
      {
        traceId: 'b',
        name: 'next-dev',
        startTime: 2_000,
        wallClockStartTime: null,
        duration: 7_500,
        eventCount: 1,
      },
    ])
  })

  it('filters /trace.json by ?session=<traceId>', async () => {
    const { filePath } = await writeFixture([
      [
        {
          name: 'next-build',
          id: 1,
          traceId: 'a',
          timestamp: 0,
          duration: 1_000,
        },
      ],
      [
        {
          name: 'next-dev',
          id: 2,
          traceId: 'b',
          timestamp: 100,
          duration: 500,
        },
      ],
    ])
    server = createPerfettoTraceServer(filePath)
    baseUrl = await listenOnEphemeralPort(server)

    const all = await request(baseUrl, '/trace.json')
    const onlyA = await request(baseUrl, '/trace.json?session=a')
    const onlyB = await request(baseUrl, '/trace.json?session=b')

    expect(JSON.parse(all.body.toString('utf8')).traceEvents).toHaveLength(4)

    const aJson = JSON.parse(onlyA.body.toString('utf8'))
    expect(aJson.traceEvents.map((e: { name: string }) => e.name)).toEqual([
      'next-build',
      'next-build',
    ])

    const bJson = JSON.parse(onlyB.body.toString('utf8'))
    expect(bJson.traceEvents.map((e: { name: string }) => e.name)).toEqual([
      'next-dev',
      'next-dev',
    ])

    // Per-session and full responses should be cached independently and
    // distinct from each other.
    expect(onlyA.body.equals(all.body)).toBe(false)
    expect(onlyA.body.equals(onlyB.body)).toBe(false)
  })
})
