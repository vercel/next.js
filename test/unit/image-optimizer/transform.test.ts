/* eslint-env jest */
import { readFile } from 'fs-extra'
import { join } from 'path'
import { serialize } from 'v8'
import { ImageError } from 'next/dist/server/image-optimizer/image-error'
import { getMaxAge } from 'next/dist/server/image-optimizer/get-max-age'
import type { imageOptimizerTransform as Transform } from 'next/dist/server/image-optimizer/transform'
import {
  getSharp,
  imageOptimizerTransform,
  type ImageOptimizerTransformConfig,
} from 'next/dist/server/image-optimizer/transform'
import type {
  CachedRouteKind,
  IncrementalResponseCacheEntry,
} from 'next/dist/server/response-cache/types'

const getImage = (filename: string) =>
  readFile(join(__dirname, 'images', filename))

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
  nextConfig: ImageOptimizerTransformConfig = config
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
    nextConfig
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

  it('constructs a serializable operation from the full server config', async () => {
    const { imageOptimizer } =
      require('next/dist/server/image-optimizer') as typeof import('next/dist/server/image-optimizer')
    const buffer = await getImage('test.png')
    let receivedConfig: unknown
    const fullConfig = {
      ...config,
      nonSerializableServerOption: () => null,
    }

    const result = await imageOptimizer(
      {
        buffer,
        contentType: 'image/png',
        cacheControl: undefined,
        etag: 'source-etag',
      },
      { href: '/test.png', width: 64, quality: 75, mimeType: 'image/webp' },
      fullConfig,
      {
        silent: true,
        runOperation: async (operation) => {
          expect(() => serialize(operation)).not.toThrow()
          receivedConfig = operation.config
          return {
            result: {
              buffer: Buffer.from('optimized'),
              contentType: 'image/webp',
              maxAge: 60,
              etag: 'optimized-etag',
              upstreamEtag: 'source-etag',
            },
            diagnostics: [],
          }
        },
      }
    )

    expect(receivedConfig).toEqual(config)
    expect(result.buffer).toEqual(Buffer.from('optimized'))
  })

  it('preserves the direct Vercel transform imports and inferred worker-pool types', async () => {
    const input: Parameters<typeof Transform>[0] = {
      buffer: await getImage('test.png'),
      contentType: 'image/png',
      cacheControl: 'public, max-age=120',
      etag: 'source-etag',
    }
    const params: Parameters<typeof Transform>[1] = {
      href: '/test.png',
      width: 64,
      quality: 75,
      mimeType: 'image/webp',
    }
    const transformConfig: Parameters<typeof Transform>[2] = config
    const sharp = getSharp(1, false)
    expect(getSharp(1, false)).toBe(sharp)
    expect(sharp.concurrency()).toBe(1)
    expect(sharp.cache().memory.max).toBe(0)
    sharp.block({ operation: ['VipsForeignLoadHeif'] })
    try {
      const result: Awaited<ReturnType<typeof Transform>> =
        await imageOptimizerTransform(input, params, transformConfig)
      expect(result.error).toBeUndefined()
      expect(await sharp(result.buffer).metadata()).toMatchObject({
        format: 'webp',
        width: 64,
      })
      // Transforming must not reinitialize Sharp and undo the service's block.
      await expect(
        sharp(await getImage('test.avif')).metadata()
      ).rejects.toThrow()
      expect(Math.max(60, getMaxAge('public, max-age=5'))).toBe(60)
      expect(getMaxAge('max-age=60, s-maxage=120')).toBe(120)
      expect(new ImageError(422, 'invalid input')).toMatchObject({
        statusCode: 422,
        message: 'invalid input',
      })
      expect(new ImageError(200, 'invalid status').statusCode).toBe(500)
    } finally {
      sharp.unblock({ operation: ['VipsForeignLoadHeif'] })
    }
  })

  it('transforms a png buffer', async () => {
    const result = await transform('test.png')
    expect(result.contentType).toBe('image/webp')
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    expect(result.maxAge).toBe(120)
  })

  it.each([undefined, true, false])(
    'encodes JPEGs with imgOptMozjpeg=%s',
    async (imgOptMozjpeg) => {
      const result = await transform('test.jpg', 'image/jpeg', {
        ...config,
        experimental: { ...config.experimental, imgOptMozjpeg },
      })
      expect(result.error).toBeUndefined()
      expect(result.contentType).toBe('image/jpeg')
      const sharp = getSharp(1, false)
      expect(await sharp(result.buffer).metadata()).toMatchObject({
        format: 'jpeg',
        width: 64,
        isProgressive: imgOptMozjpeg ?? true,
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
        }
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
        config
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
