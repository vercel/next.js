import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import {
  StaticResponseCache,
  buildCacheKey,
  createCapturingResponse,
} from 'next/src/server/static-response-cache'

function createMockReq(
  url: string,
  headers: Record<string, string> = {}
): IncomingMessage {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = url
  req.method = 'GET'
  Object.assign(req.headers, headers)
  return req
}

function createMockRes(): ServerResponse {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  const res = new ServerResponse(req)
  // Prevent actual socket writes
  res.assignSocket(socket)
  return res
}

describe('buildCacheKey', () => {
  it('returns the URL without query string', () => {
    expect(buildCacheKey('/about')).toBe('/about')
    expect(buildCacheKey('/about?foo=bar')).toBe('/about')
    expect(buildCacheKey('/about?_rsc=abc123')).toBe('/about')
  })

  it('preserves .rsc suffix for RSC requests', () => {
    expect(buildCacheKey('/about.rsc')).toBe('/about.rsc')
    expect(buildCacheKey('/about.rsc?_rsc=abc')).toBe('/about.rsc')
  })

  it('handles root path', () => {
    expect(buildCacheKey('/')).toBe('/')
    expect(buildCacheKey('/?q=1')).toBe('/')
  })
})

describe('StaticResponseCache', () => {
  it('returns false for cache miss', () => {
    const cache = new StaticResponseCache()
    const req = createMockReq('/about')
    const res = createMockRes()

    expect(cache.serve('/about', req, res)).toBe(false)
  })

  it('serves cached response on hit', () => {
    const cache = new StaticResponseCache()

    const body = Buffer.from('<html>hello</html>')
    cache.set('/about', {
      statusCode: 200,
      headers: [
        ['Content-Type', 'text/html'],
        ['ETag', '"abc"'],
      ],
      body,
      etag: '"abc"',
      cachedAt: Date.now(),
    })

    const req = createMockReq('/about')
    const res = createMockRes()

    // Mock end to prevent actual socket writes
    let endCalled = false
    let endChunk: any = undefined
    res.end = ((...args: any[]) => {
      endCalled = true
      endChunk = args[0]
      return res
    }) as any

    const served = cache.serve('/about', req, res)
    expect(served).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(endCalled).toBe(true)
    expect(endChunk).toBe(body)
  })

  it('returns 304 when If-None-Match matches ETag', () => {
    const cache = new StaticResponseCache()

    cache.set('/about', {
      statusCode: 200,
      headers: [
        ['Content-Type', 'text/html'],
        ['ETag', '"abc"'],
        ['Cache-Control', 'public, max-age=31536000'],
      ],
      body: Buffer.from('<html>hello</html>'),
      etag: '"abc"',
      cachedAt: Date.now(),
    })

    const req = createMockReq('/about', { 'if-none-match': '"abc"' })
    const res = createMockRes()

    let endCalled = false
    let endChunk: any = undefined
    res.end = ((...args: any[]) => {
      endCalled = true
      endChunk = args[0]
      return res
    }) as any

    const served = cache.serve('/about', req, res)
    expect(served).toBe(true)
    expect(res.statusCode).toBe(304)
    expect(endCalled).toBe(true)
    // 304 should not send body
    expect(endChunk).toBeUndefined()
  })

  it('respects maxEntries and evicts oldest', () => {
    const cache = new StaticResponseCache({ maxEntries: 2 })

    const entry = (path: string) => ({
      statusCode: 200,
      headers: [] as [string, string | string[]][],
      body: Buffer.from(`body for ${path}`),
      etag: undefined,
      cachedAt: Date.now(),
    })

    cache.set('/a', entry('/a'))
    cache.set('/b', entry('/b'))
    expect(cache.size).toBe(2)

    // Adding a third should evict the first
    cache.set('/c', entry('/c'))
    expect(cache.size).toBe(2)
    expect(cache.has('/a')).toBe(false)
    expect(cache.has('/b')).toBe(true)
    expect(cache.has('/c')).toBe(true)
  })

  it('rejects entries exceeding maxBodySize', () => {
    const cache = new StaticResponseCache({ maxBodySize: 10 })

    cache.set('/large', {
      statusCode: 200,
      headers: [],
      body: Buffer.alloc(100),
      etag: undefined,
      cachedAt: Date.now(),
    })

    expect(cache.has('/large')).toBe(false)
  })

  it('invalidate removes all variants for a pathname', () => {
    const cache = new StaticResponseCache()
    const entry = {
      statusCode: 200,
      headers: [] as [string, string | string[]][],
      body: Buffer.from('test'),
      etag: undefined,
      cachedAt: Date.now(),
    }

    cache.set('/about', entry)
    cache.set('/about.rsc', entry)
    cache.set('/other', entry)

    cache.invalidate('/about')
    expect(cache.has('/about')).toBe(false)
    expect(cache.has('/about.rsc')).toBe(false)
    expect(cache.has('/other')).toBe(true)
  })

  it('delete removes a specific entry', () => {
    const cache = new StaticResponseCache()
    cache.set('/about', {
      statusCode: 200,
      headers: [],
      body: Buffer.from('test'),
      etag: undefined,
      cachedAt: Date.now(),
    })

    expect(cache.delete('/about')).toBe(true)
    expect(cache.has('/about')).toBe(false)
  })

  it('clear removes all entries', () => {
    const cache = new StaticResponseCache()
    cache.set('/a', {
      statusCode: 200,
      headers: [],
      body: Buffer.from('a'),
      etag: undefined,
      cachedAt: Date.now(),
    })
    cache.set('/b', {
      statusCode: 200,
      headers: [],
      body: Buffer.from('b'),
      etag: undefined,
      cachedAt: Date.now(),
    })

    cache.clear()
    expect(cache.size).toBe(0)
  })
})

describe('createCapturingResponse', () => {
  it('captures headers and body from end()', () => {
    const res = createMockRes()
    let captured: any = null

    // Override end to prevent socket writes
    const origEnd = res.end.bind(res)
    // We need to suppress the actual write
    res.socket?.destroy()

    const wrapped = createCapturingResponse(res, (c) => {
      captured = c
    })

    wrapped.setHeader('Content-Type', 'text/html')
    wrapped.setHeader('ETag', '"test"')
    wrapped.statusCode = 200

    try {
      wrapped.end('<html>test</html>')
    } catch {
      // Socket may be destroyed, that's fine for the test
    }

    expect(captured).not.toBeNull()
    expect(captured.statusCode).toBe(200)
    expect(captured.etag).toBe('"test"')
    expect(captured.body.toString()).toBe('<html>test</html>')
    expect(captured.headers).toEqual([
      ['Content-Type', 'text/html'],
      ['ETag', '"test"'],
    ])
  })
})
