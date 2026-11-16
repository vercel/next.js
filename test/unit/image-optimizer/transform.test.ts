/* eslint-env jest */
import { readFile } from 'fs-extra'
import { join } from 'path'
import {
  getSharp,
  imageOptimizerTransform,
  type ImageOptimizerTransformOptions,
} from 'next/experimental/image-optimizer-transform'
import { getImageEtag } from 'next/dist/server/image-optimizer/extract-etag'
import { optimizeImage } from 'next/dist/server/image-optimizer/sharp'
import type {
  CachedRouteKind,
  IncrementalResponseCacheEntry,
} from 'next/dist/server/response-cache/types'

const getImage = (filename: string) =>
  readFile(join(__dirname, 'images', filename))

const transformOptions: ImageOptimizerTransformOptions = {
  dangerouslyAllowSVG: true,
  minimumCacheTTL: 60,
  concurrency: 1,
  operationCache: false,
  maxInputPixels: 67_108_864,
  sequentialRead: true,
  timeoutInSeconds: 6,
}

async function transform(
  filename: string,
  mimeType = 'image/webp',
  opts: ImageOptimizerTransformOptions = transformOptions
) {
  const buffer = await getImage(filename)
  return imageOptimizerTransform(
    {
      buffer,
      contentType: undefined,
      cacheControl: 'public, max-age=120',
      etag: 'source-etag',
    },
    { href: `/${filename}`, width: 64, quality: 75, mimeType },
    opts
  )
}

async function transformInDevelopment(
  filename: string,
  previousCacheEntry?: IncrementalResponseCacheEntry
) {
  return transformBufferInDevelopment(
    await getImage(filename),
    'source-etag',
    'image/webp',
    previousCacheEntry
  )
}

function transformBufferInDevelopment(
  buffer: Buffer,
  etag: string,
  mimeType: string,
  previousCacheEntry?: IncrementalResponseCacheEntry
) {
  // Required lazily so that the "loads without the server image optimizer
  // dependency graph" test can verify
  // `next/experimental/image-optimizer-transform` doesn't pull in
  // `server/image-optimizer` on its own.
  const { imageOptimizer } =
    require('next/dist/server/image-optimizer') as typeof import('next/dist/server/image-optimizer')
  return imageOptimizer(
    {
      buffer,
      contentType: undefined,
      cacheControl: undefined,
      etag,
    },
    { href: '/image', width: 8, quality: 70, mimeType },
    transformOptions,
    { isDev: true, silent: true, previousCacheEntry }
  )
}

describe('imageOptimizerTransform', () => {
  it('only exposes the public API', () => {
    expect(
      Object.keys(require('next/experimental/image-optimizer-transform')).sort()
    ).toEqual([
      'ImageError',
      'getMaxAge',
      'getSharp',
      'imageOptimizerTransform',
    ])
  })

  it('loads without the server image optimizer dependency graph', () => {
    const loaded = Object.keys(require.cache)
    expect(
      loaded.some((path) => /\/server\/image-optimizer\.[jt]s$/.test(path))
    ).toBe(false)
    expect(
      loaded.some((path) => path.includes('/server/response-cache/'))
    ).toBe(false)
    expect(
      loaded.some((path) => /\/server\/serve-static\.[jt]s$/.test(path))
    ).toBe(false)
    expect(
      loaded.some((path) => /\/server\/lib\/mock-request\.[jt]s$/.test(path))
    ).toBe(false)
    expect(
      loaded.some((path) => /\/server\/config-shared\.[jt]s$/.test(path))
    ).toBe(false)
    expect(
      loaded.some((path) => /\/build\/output\/log\.[jt]s$/.test(path))
    ).toBe(false)
  })

  it('transforms a png buffer', async () => {
    const result = await transform('test.png')
    expect(result.contentType).toBe('image/webp')
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    expect(result.maxAge).toBe(120)
    expect(result.optimized).toBe(true)
  })

  it('transforms with default options', async () => {
    const result = await transform('test.png', 'image/webp', {})
    expect(result.contentType).toBe('image/webp')
    expect(result.maxAge).toBe(120)
    expect(result.optimized).toBe(true)
    await expect(transform('test.svg', 'image/webp', {})).rejects.toMatchObject(
      { statusCode: 400 }
    )
  })

  it.each([undefined, true, false])(
    'encodes JPEGs with mozjpeg=%s',
    async (mozjpeg) => {
      const result = await transform('test.jpg', 'image/jpeg', {
        ...transformOptions,
        mozjpeg,
      })
      expect(result.error).toBeUndefined()
      expect(result.contentType).toBe('image/jpeg')
      const sharp = getSharp(1, false)
      expect(await sharp(result.buffer).metadata()).toMatchObject({
        format: 'jpeg',
        width: 64,
        isProgressive: mozjpeg ?? true,
      })
    }
  )

  it('preserves the source format when no output format is requested', async () => {
    const result = await transform('test.png', '')
    expect(result.contentType).toBe('image/png')
  })

  it('transforms an avif source', async () => {
    const source = await getImage('test.avif')
    const result = await transform('test.avif')
    expect(result.buffer).not.toEqual(source)
    expect(result.contentType).toBe('image/webp')
  })

  it('downlevels an avif source when no output format is requested', async () => {
    const result = await transform('test.avif', '')
    expect(result.contentType).toBe('image/jpeg')
  })

  it('generates blur placeholders in development', async () => {
    const result = await transformInDevelopment('test.png')
    expect(result.contentType).toBe('image/svg+xml')
    expect(result.buffer.toString()).toContain('<svg')
  })

  it('generates blur placeholders when optimization does not change the image', async () => {
    // An image already encoded with the blur settings round-trips through
    // sharp unchanged, so its optimized etag matches its upstream etag.
    const encode = (buffer: Buffer) =>
      optimizeImage({ buffer, contentType: 'image/png', quality: 70, width: 8 })
    const source = await encode(await encode(await getImage('test.png')))
    expect(await encode(source)).toEqual(source)

    const etag = getImageEtag(source)
    const result = await transformBufferInDevelopment(source, etag, 'image/png')
    expect(result.contentType).toBe('image/svg+xml')
    expect(result.buffer.toString()).toContain('<svg')
  })

  it('does not generate blur placeholders for bypassed images', async () => {
    const source = await getImage('test.svg')
    const result = await transformInDevelopment('test.svg')
    expect(result.buffer).toEqual(source)
    expect(result.contentType).toBe('image/svg+xml')
  })

  it('reuses a previous cache entry without generating a blur placeholder', async () => {
    const previousBuffer = Buffer.from('previous image')
    const result = await transformInDevelopment('test.png', {
      value: {
        kind: 'IMAGE' as CachedRouteKind.IMAGE,
        buffer: previousBuffer,
        etag: 'optimized-etag',
        upstreamEtag: 'source-etag',
        extension: 'webp',
      },
      cacheControl: { revalidate: 90, expire: undefined },
    })
    expect(result.buffer).toEqual(previousBuffer)
    expect(result.contentType).toBe('image/webp')
    expect(result.maxAge).toBe(90)
  })

  it('bypasses svg buffers', async () => {
    const source = await getImage('test.svg')
    const result = await transform('test.svg')
    expect(result.buffer).toEqual(source)
    expect(result.contentType).toBe('image/svg+xml')
    expect(result.optimized).toBe(false)
  })

  it('bypasses animated buffers', async () => {
    const source = await getImage('animated.webp')
    const result = await transform('animated.webp')
    expect(result.buffer).toEqual(source)
    expect(result.contentType).toBe('image/webp')
    expect(result.optimized).toBe(false)
  })

  it('rejects disallowed svg buffers', async () => {
    await expect(
      imageOptimizerTransform(
        {
          buffer: await getImage('test.svg'),
          contentType: undefined,
          cacheControl: undefined,
          etag: 'source-etag',
        },
        { href: '/test.svg', width: 64, quality: 75, mimeType: 'image/webp' },
        { ...transformOptions, dangerouslyAllowSVG: false }
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects unrecognized buffers', async () => {
    await expect(
      imageOptimizerTransform(
        {
          buffer: Buffer.from('not an image'),
          contentType: undefined,
          cacheControl: undefined,
          etag: 'source-etag',
        },
        { href: '/bad', width: 64, quality: 75, mimeType: 'image/webp' },
        transformOptions
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
