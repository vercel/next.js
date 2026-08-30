/* eslint-env jest */
import { readFile } from 'fs-extra'
import { join } from 'path'
import {
  imageOptimizerTransform,
  type ImageOptimizerTransformOptions,
} from 'next/dist/server/image-optimizer/transform'
import type {
  CachedRouteKind,
  IncrementalResponseCacheEntry,
} from 'next/dist/server/response-cache/types'

const getImage = (filename: string) =>
  readFile(join(__dirname, 'images', filename))

const isValidMime = (contentType: string) => contentType === 'image/png'

const config = {
  images: {
    dangerouslyAllowSVG: true,
    minimumCacheTTL: 60,
  },
  experimental: {
    imgOptConcurrency: 1,
    imgOptOperationCache: false,
    imgOptMaxInputPixels: 67_108_864,
    imgOptSequentialRead: true,
    imgOptTimeoutInSeconds: 6,
  },
}

async function transform(
  filename: string,
  mimeType = 'image/webp',
  options?: ImageOptimizerTransformOptions
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
    config,
    { isValidMime, ...options }
  )
}

async function transformInDevelopment(
  filename: string,
  previousCacheEntry?: IncrementalResponseCacheEntry
) {
  const { imageOptimizer } =
    require('next/dist/server/image-optimizer') as typeof import('next/dist/server/image-optimizer')
  const buffer = await getImage(filename)
  return imageOptimizer(
    {
      buffer,
      contentType: undefined,
      cacheControl: undefined,
      etag: 'source-etag',
    },
    { href: `/${filename}`, width: 8, quality: 70, mimeType: 'image/webp' },
    config,
    { isDev: true, silent: true, previousCacheEntry }
  )
}

describe('imageOptimizerTransform', () => {
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
  })

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

  it('generates blur placeholders in development', async () => {
    const result = await transformInDevelopment('test.png')
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
  })

  it('bypasses animated buffers', async () => {
    const source = await getImage('animated.webp')
    const result = await transform('animated.webp')
    expect(result.buffer).toEqual(source)
    expect(result.contentType).toBe('image/webp')
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
        {
          ...config,
          images: { ...config.images, dangerouslyAllowSVG: false },
        },
        { isValidMime }
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
        config,
        { isValidMime }
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
