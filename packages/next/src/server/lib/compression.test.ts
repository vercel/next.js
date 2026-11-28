/* eslint-env node */
import type { Server } from 'node:http'
import http from 'node:http'
import zlib from 'node:zlib'
import { once } from 'node:events'
import { promisify } from 'node:util'

import type { CompressionAlgorithm } from './compression'
import {
  isZstdSupported,
  negotiateEncoding,
  normalizeCompressConfig,
  parseAcceptEncoding,
  isCompressibleMimeType,
  setupMultiEncodingCompression,
} from './compression'

// `zlib.zstdDecompress` is newer than the type definitions available here.
type ZlibWithZstd = typeof zlib & {
  zstdDecompress?: (
    buf: Buffer,
    cb: (err: Error | null, decompressed: Buffer) => void
  ) => void
}
const zlibMaybe = zlib as ZlibWithZstd

const brotliDecompressAsync = promisify(zlib.brotliDecompress)
const gunzipAsync = promisify(zlib.gunzip)
const zstdDecompressAsync = promisify(
  zlibMaybe.zstdDecompress ??
    ((_: Buffer, cb: (err: Error | null, decompressed: Buffer) => void) =>
      cb(new Error('zstd not available'), Buffer.alloc(0)))
)

describe('parseAcceptEncoding', () => {
  it('parses tokens with implicit and explicit quality values', () => {
    const parsed = parseAcceptEncoding('zstd, gzip;q=0.8, br;q=0.5')
    expect(parsed.get('zstd')).toBe(1)
    expect(parsed.get('gzip')).toBe(0.8)
    expect(parsed.get('br')).toBe(0.5)
  })

  it('lowercases tokens and tolerates whitespace', () => {
    const parsed = parseAcceptEncoding('  GZIP , BR;q=1')
    expect(parsed.get('gzip')).toBe(1)
    expect(parsed.get('br')).toBe(1)
  })

  it('handles an empty header', () => {
    expect(parseAcceptEncoding(undefined).size).toBe(0)
    expect(parseAcceptEncoding('').size).toBe(0)
  })
})

describe('negotiateEncoding', () => {
  const all = ['zstd', 'brotli', 'gzip'] as const

  it('prefers zstd when everything is acceptable', () => {
    expect(negotiateEncoding('zstd, br, gzip', [...all])).toBe('zstd')
  })

  it('falls back to br when zstd is not offered', () => {
    expect(negotiateEncoding('br, gzip', [...all])).toBe('brotli')
  })

  it('honors quality ordering', () => {
    expect(negotiateEncoding('gzip;q=1.0, br;q=0.5', [...all])).toBe('gzip')
  })

  it('treats q=0 as explicit rejection', () => {
    expect(negotiateEncoding('br;q=0, gzip', [...all])).toBe('gzip')
    expect(
      negotiateEncoding('gzip, br;q=0', ['brotli'] as CompressionAlgorithm[])
    ).toBeNull()
  })

  it('matches wildcard but never overrides explicit zero', () => {
    expect(negotiateEncoding('*;q=0.5', [...all])).toBe('zstd')
    expect(
      negotiateEncoding('br;q=0, *;q=0.5', ['brotli'] as CompressionAlgorithm[])
    ).toBeNull()
  })

  it('returns null without an Accept-Encoding header', () => {
    expect(negotiateEncoding(undefined, [...all])).toBeNull()
    expect(negotiateEncoding('identity', [...all])).toBeNull()
  })

  it('respects the candidate order on ties', () => {
    expect(
      negotiateEncoding('gzip, br', [
        'gzip',
        'brotli',
      ] as CompressionAlgorithm[])
    ).toBe('gzip')
    expect(
      negotiateEncoding('gzip, br', [
        'brotli',
        'gzip',
      ] as CompressionAlgorithm[])
    ).toBe('brotli')
  })
})

describe('isCompressibleMimeType', () => {
  it('compresses textual and JSON-like types', () => {
    expect(isCompressibleMimeType('text/html; charset=utf-8')).toBe(true)
    expect(isCompressibleMimeType('application/json')).toBe(true)
    expect(isCompressibleMimeType('application/javascript')).toBe(true)
    expect(isCompressibleMimeType('text/plain')).toBe(true)
    expect(isCompressibleMimeType('image/svg+xml')).toBe(true)
  })

  it('does not compress already-compressed formats', () => {
    expect(isCompressibleMimeType('image/png')).toBe(false)
    expect(isCompressibleMimeType('image/jpeg')).toBe(false)
    expect(isCompressibleMimeType('font/woff2')).toBe(false)
    expect(isCompressibleMimeType('application/wasm')).toBe(false)
    expect(isCompressibleMimeType('video/mp4')).toBe(false)
  })

  it('is false for a missing content type', () => {
    expect(isCompressibleMimeType(null)).toBe(false)
  })
})

describe('normalizeCompressConfig', () => {
  it('keeps the legacy gzip-only default', () => {
    expect(normalizeCompressConfig(undefined)).toEqual({
      algorithms: ['gzip'],
      staticPrecompress: false,
    })
    expect(normalizeCompressConfig(true)).toEqual({
      algorithms: ['gzip'],
      staticPrecompress: false,
    })
  })

  it('can be disabled', () => {
    expect(normalizeCompressConfig(false)).toBeNull()
    expect(normalizeCompressConfig({ gzip: false })).toBeNull()
  })

  it('opts into brotli while keeping gzip', () => {
    const normalized = normalizeCompressConfig({ brotli: true })
    expect(normalized?.algorithms).toEqual(['brotli', 'gzip'])
  })

  it('prefers zstd over brotli and gzip when enabled', () => {
    const normalized = normalizeCompressConfig({ brotli: true, zstd: true })
    if (isZstdSupported()) {
      expect(normalized?.algorithms).toEqual(['zstd', 'brotli', 'gzip'])
    } else {
      expect(normalized?.algorithms).toEqual(['brotli', 'gzip'])
    }
  })

  it('keeps numeric thresholds and defaults to 1024', () => {
    expect(
      normalizeCompressConfig({ brotli: true, threshold: 512 })?.threshold
    ).toBe(512)
    expect(normalizeCompressConfig({ brotli: true })?.threshold).toBe(1024)
  })

  it('exposes staticPrecompress', () => {
    expect(
      normalizeCompressConfig({ brotli: true, staticPrecompress: true })
        ?.staticPrecompress
    ).toBe(true)
  })
})

const LARGE_BODY = Array.from({ length: 4096 }, (_, i) => `line ${i}\n`).join(
  ''
)

async function request(
  port: number,
  options: {
    path?: string
    method?: string
    headers?: Record<string, string>
  } = {}
): Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }> {
  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      const req = http.request(
        {
          port,
          path: options.path ?? '/',
          method: options.method ?? 'GET',
          headers: options.headers,
        },
        (res) => resolve(res)
      )
      req.on('error', reject)
      req.end()
    }
  )

  const chunks: Buffer[] = []
  for await (const chunk of response) {
    chunks.push(chunk as Buffer)
  }
  return { headers: response.headers, body: Buffer.concat(chunks) }
}

describe('setupMultiEncodingCompression', () => {
  let server: Server
  let port: number

  beforeAll(async () => {
    const middleware = setupMultiEncodingCompression({
      algorithms: isZstdSupported()
        ? ['zstd', 'brotli', 'gzip']
        : ['brotli', 'gzip'],
    })
    server = http.createServer((req, res) => {
      // The middleware wraps every response; routes run inside `next()`,
      // exactly like in the real server.
      middleware(req, res, () => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        switch (url.pathname) {
          case '/small': {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('tiny')
            return
          }
          case '/notransform': {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Cache-Control', 'public, no-transform')
            res.end(LARGE_BODY)
            return
          }
          case '/already': {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Content-Encoding', 'gzip')
            res.end('already encoded')
            return
          }
          case '/binary': {
            res.setHeader('Content-Type', 'image/png')
            res.end(LARGE_BODY)
            return
          }
          default: {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(LARGE_BODY)
          }
        }
      })
    })
    server.listen(0)
    await once(server, 'listening')
    port = (server.address() as { port: number }).port
  })

  afterAll(async () => {
    server.close()
    await once(server, 'close')
  })

  it('compresses with zstd when accepted', async () => {
    if (!isZstdSupported()) return
    const { headers, body } = await request(port, {
      headers: { 'Accept-Encoding': 'zstd, br, gzip' },
    })
    expect(headers['content-encoding']).toBe('zstd')
    expect(headers.vary).toMatch(/Accept-Encoding/i)
    expect(headers['content-length']).toBeUndefined()
    expect((await zstdDecompressAsync(body)).toString()).toBe(LARGE_BODY)
  })

  it('compresses with brotli when zstd is not offered', async () => {
    const { headers, body } = await request(port, {
      headers: { 'Accept-Encoding': 'br, gzip' },
    })
    expect(headers['content-encoding']).toBe('br')
    expect((await brotliDecompressAsync(body)).toString()).toBe(LARGE_BODY)
  })

  it('compresses with gzip', async () => {
    const { headers, body } = await request(port, {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    expect(headers['content-encoding']).toBe('gzip')
    expect((await gunzipAsync(body)).toString()).toBe(LARGE_BODY)
  })

  it('streams identity when the client accepts nothing', async () => {
    const { headers, body } = await request(port, {
      headers: { 'Accept-Encoding': 'identity' },
    })
    expect(headers['content-encoding']).toBeUndefined()
    expect(body.toString()).toBe(LARGE_BODY)
  })

  it('skips responses below the threshold', async () => {
    const { headers, body } = await request(port, {
      path: '/small',
      headers: { 'Accept-Encoding': 'zstd, br, gzip' },
    })
    expect(headers['content-encoding']).toBeUndefined()
    expect(body.toString()).toBe('tiny')
  })

  it('honors Cache-Control: no-transform', async () => {
    const { headers, body } = await request(port, {
      path: '/notransform',
      headers: { 'Accept-Encoding': 'zstd, br, gzip' },
    })
    expect(headers['content-encoding']).toBeUndefined()
    expect(body.toString()).toBe(LARGE_BODY)
  })

  it('leaves already-encoded responses untouched', async () => {
    const { headers } = await request(port, {
      path: '/already',
      headers: { 'Accept-Encoding': 'br' },
    })
    expect(headers['content-encoding']).toBe('gzip')
  })

  it('does not compress incompressible content types', async () => {
    const { headers } = await request(port, {
      path: '/binary',
      headers: { 'Accept-Encoding': 'br, gzip' },
    })
    expect(headers['content-encoding']).toBeUndefined()
  })
})
