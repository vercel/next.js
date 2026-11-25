import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'

import { nextTestSetup, isNextDev } from 'e2e-utils'
import { fetchViaRawHttp } from 'next-test-utils'

// `zlib.zstdDecompress`/`createZstdCompress` are newer than the type
// definitions available here.
type ZlibWithZstd = typeof zlib & {
  zstdDecompress?: (
    buf: Buffer,
    cb: (err: Error | null, decompressed: Buffer) => void
  ) => void
  createZstdCompress?: unknown
}
const zlibMaybe = zlib as ZlibWithZstd

const gunzipAsync = promisify(zlib.gunzip)
const brotliDecompressAsync = promisify(zlib.brotliDecompress)
const zstdDecompressAsync = promisify(
  zlibMaybe.zstdDecompress ??
    ((_: Buffer, cb: (err: Error | null, decompressed: Buffer) => void) =>
      cb(new Error('zstd not available'), Buffer.alloc(0)))
)
const zstdAvailable = typeof zlibMaybe.createZstdCompress === 'function'

const decompressByEncoding: Record<string, (buf: Buffer) => Promise<Buffer>> = {
  gzip: gunzipAsync,
  br: brotliDecompressAsync,
  zstd: zstdDecompressAsync,
}

async function fetchWith(
  next: { url: string },
  pathname: string,
  acceptEncoding?: string,
  method = 'GET'
) {
  const response = await fetchViaRawHttp(next.url, pathname, {
    method,
    headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : undefined,
  })
  const buf = Buffer.from(await response.arrayBuffer())
  const encoding = response.headers.get('content-encoding')
  const body = encoding
    ? (await decompressByEncoding[encoding](buf)).toString()
    : buf.toString()
  return { response, body, encoding }
}

const DYNAMIC_BODY = 'x'.repeat(2048)

/**
 * The full `Accept-Encoding` matrix against the two server-side response
 * shapes, with `compress: { gzip, brotli, zstd, staticPrecompress }`:
 *
 * - `/route-large` is always compressed by the negotiating middleware,
 *   preferring zstd (fastest decode on the dynamic path).
 * - `/_next/static/**` is served from build-time sidecars, preferring br
 *   (its better ratio costs nothing at request time).
 *
 * Clients that accept nothing usable (no header, `identity`, unknown
 * encodings, or everything rejected with `q=0`) land on identity. The
 * `withoutZstd` override covers Node versions without zstd in zlib, where
 * the algorithm is dropped from both the middleware and the sidecar set.
 */
const matrix: Array<{
  accept?: string
  label: string
  dynamic: string | null
  static: string | null
  withoutZstd?: { dynamic: string | null; static: string | null }
}> = [
  {
    accept: undefined,
    label: 'no Accept-Encoding',
    dynamic: null,
    static: null,
  },
  { accept: 'identity', label: 'identity only', dynamic: null, static: null },
  { accept: 'gzip', label: 'gzip only', dynamic: 'gzip', static: 'gzip' },
  { accept: 'br', label: 'brotli only', dynamic: 'br', static: 'br' },
  {
    accept: 'zstd',
    label: 'zstd only',
    dynamic: 'zstd',
    static: 'zstd',
    withoutZstd: { dynamic: null, static: null },
  },
  { accept: 'gzip, br', label: 'gzip + brotli', dynamic: 'br', static: 'br' },
  {
    accept: 'gzip, zstd',
    label: 'gzip + zstd',
    dynamic: 'zstd',
    static: 'zstd',
    withoutZstd: { dynamic: 'gzip', static: 'gzip' },
  },
  {
    accept: 'br, zstd',
    label: 'brotli + zstd',
    dynamic: 'zstd',
    // The static column differs from the dynamic one on purpose: with the
    // variants pre-compressed at build time, br's better ratio is free.
    static: 'br',
    withoutZstd: { dynamic: 'br', static: 'br' },
  },
  {
    accept: 'zstd, br, gzip',
    label: 'all three',
    dynamic: 'zstd',
    static: 'br',
    withoutZstd: { dynamic: 'br', static: 'br' },
  },
  {
    accept: '*',
    label: 'wildcard',
    dynamic: 'zstd',
    static: 'br',
    withoutZstd: { dynamic: 'br', static: 'br' },
  },
  {
    accept: 'br;q=0, gzip',
    label: 'gzip with brotli rejected',
    dynamic: 'gzip',
    static: 'gzip',
  },
  {
    accept: 'gzip, br;q=0, zstd;q=0',
    label: 'only gzip survives rejections',
    dynamic: 'gzip',
    static: 'gzip',
  },
  {
    accept: 'deflate',
    label: 'unknown encoding only',
    dynamic: null,
    static: null,
  },
]

describe('Compression (brotli + zstd opt-in)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  /** A content-hashed chunk emitted under /_next/static. */
  async function staticAssetPath(): Promise<string> {
    const { body: html } = await fetchWith(next, '/', 'identity')
    const assetMatch = /\/_next\/static\/[^"']+\.js/.exec(html)
    expect(assetMatch).not.toBeNull()
    return assetMatch![0]
  }

  for (const row of matrix) {
    const expected =
      !zstdAvailable && row.withoutZstd
        ? { dynamic: row.withoutZstd.dynamic, static: row.withoutZstd.static }
        : { dynamic: row.dynamic, static: row.static }

    it(`negotiates "${row.label}" for dynamic responses`, async () => {
      const { response, body, encoding } = await fetchWith(
        next,
        '/route-large',
        row.accept
      )
      expect(encoding).toBe(expected.dynamic)
      if (expected.dynamic) {
        expect(response.headers.get('vary')).toMatch(/Accept-Encoding/i)
      }
      expect(body).toBe(DYNAMIC_BODY)
    })

    if (isNextDev) {
      // Dev servers have no build-time sidecars; the static column of the
      // matrix is only meaningful against `next start`.
      continue
    }

    it(`negotiates "${row.label}" for pre-compressed static assets`, async () => {
      const assetPath = await staticAssetPath()
      const { response, body, encoding } = await fetchWith(
        next,
        assetPath,
        row.accept
      )
      expect(encoding).toBe(expected.static)
      if (expected.static) {
        expect(response.headers.get('vary')).toMatch(/Accept-Encoding/i)
        expect(response.headers.get('content-type')).toMatch(/javascript/)
      }
      // Whatever variant was served decompresses to the untouched original.
      const { body: plain } = await fetchWith(next, assetPath, 'identity')
      expect(body).toBe(plain)
      expect(body.length).toBeGreaterThan(1024)
    })
  }

  it('compresses rendered page HTML with brotli', async () => {
    const { body, encoding } = await fetchWith(next, '/', 'br, gzip')
    expect(encoding).toBe('br')
    expect(body).toContain('hello')
  })

  it('writes pre-compressed sidecars into the static build output', () => {
    if (isNextDev) return
    const staticDir = path.join(next.testDir, '.next', 'static')
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          out.push(...walk(entryPath))
        } else if (entry.name.endsWith('.js.br')) {
          out.push(entryPath)
        }
      }
      return out
    }
    const brotliSidecars = walk(staticDir)
    expect(brotliSidecars.length).toBeGreaterThan(0)
    if (zstdAvailable) {
      expect(
        brotliSidecars.some((sidecar) =>
          fs.existsSync(sidecar.replace(/\.br$/, '.zst'))
        )
      ).toBe(true)
    }
  })

  it('does not transform HEAD responses', async () => {
    const { encoding } = await fetchWith(next, '/', 'zstd, br, gzip', 'HEAD')
    expect(encoding).toBeNull()
  })
})
