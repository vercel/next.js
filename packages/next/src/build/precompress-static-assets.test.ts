/* eslint-env node */
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'

import { precompressStaticAssets } from './precompress-static-assets'
import { isZstdSupported } from '../server/lib/compression'

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

describe('precompressStaticAssets', () => {
  let tmpDir: string
  let staticDir: string

  const bigJs = 'console.log("hello world");\n'.repeat(4000)
  const bigCss = 'body { color: red; }\n'.repeat(4000)
  const smallJs = 'console.log(1)'

  beforeAll(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'precompress-test-')
    )
    staticDir = path.join(tmpDir, 'static')

    await fs.promises.mkdir(path.join(staticDir, 'chunks'), {
      recursive: true,
    })
    await fs.promises.mkdir(path.join(staticDir, 'css'), { recursive: true })
    await fs.promises.mkdir(path.join(staticDir, 'media'), { recursive: true })

    await fs.promises.writeFile(
      path.join(staticDir, 'chunks', 'main-abc123.js'),
      bigJs
    )
    await fs.promises.writeFile(
      path.join(staticDir, 'css', 'globals-abc123.css'),
      bigCss
    )
    await fs.promises.writeFile(
      path.join(staticDir, 'chunks', 'small-def456.js'),
      smallJs
    )
    // Over the threshold but with an extension we deliberately skip.
    await fs.promises.writeFile(
      path.join(staticDir, 'media', 'font.woff2'),
      Buffer.from('woff2-binary-contents '.repeat(400))
    )
  })

  afterAll(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  })

  it('writes sidecars for compressible assets and round-trips', async () => {
    const result = await precompressStaticAssets({
      distDir: tmpDir,
      algorithms: isZstdSupported()
        ? ['gzip', 'brotli', 'zstd']
        : ['gzip', 'brotli'],
    })

    const jsPath = path.join(staticDir, 'chunks', 'main-abc123.js')
    expect(fs.existsSync(jsPath + '.gz')).toBe(true)
    expect(fs.existsSync(jsPath + '.br')).toBe(true)
    if (isZstdSupported()) {
      expect(fs.existsSync(jsPath + '.zst')).toBe(true)
      expect(
        (
          await zstdDecompressAsync(await fs.promises.readFile(jsPath + '.zst'))
        ).toString()
      ).toBe(bigJs)
    }
    expect(
      (await gunzipAsync(await fs.promises.readFile(jsPath + '.gz'))).toString()
    ).toBe(bigJs)
    expect(
      (
        await brotliDecompressAsync(await fs.promises.readFile(jsPath + '.br'))
      ).toString()
    ).toBe(bigJs)

    const cssPath = path.join(staticDir, 'css', 'globals-abc123.css')
    expect(fs.existsSync(cssPath + '.br')).toBe(true)

    expect(result.sidecars).toBeGreaterThanOrEqual(2)
    expect(result.bytesSaved).toBeGreaterThan(0)
  })

  it('skips small files and non-text extensions', () => {
    const smallPath = path.join(staticDir, 'chunks', 'small-def456.js')
    expect(fs.existsSync(smallPath + '.gz')).toBe(false)
    expect(fs.existsSync(smallPath + '.br')).toBe(false)

    const woff2Path = path.join(staticDir, 'media', 'font.woff2')
    expect(fs.existsSync(woff2Path + '.gz')).toBe(false)
    expect(fs.existsSync(woff2Path + '.br')).toBe(false)
  })

  it('is idempotent', async () => {
    const first = await precompressStaticAssets({
      distDir: tmpDir,
      algorithms: ['gzip'],
    })
    const second = await precompressStaticAssets({
      distDir: tmpDir,
      algorithms: ['gzip'],
    })
    expect(second.sidecars).toBe(first.sidecars)
  })
})
