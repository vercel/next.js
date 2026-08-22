/* eslint-env jest */
import { imageOptimizer, getImageEtag } from 'next/dist/server/image-optimizer'
import {
  CachedRouteKind,
  IncrementalResponseCacheEntry,
} from 'next/dist/server/response-cache/types'
import { readFile } from 'fs-extra'
import { join } from 'path'

const nextConfig = {
  experimental: {
    imgOptConcurrency: null,
    imgOptMaxInputPixels: undefined,
    imgOptSequentialRead: null,
    imgOptSkipMetadata: false,
    imgOptTimeoutInSeconds: 7,
  },
  images: {
    dangerouslyAllowSVG: false,
    minimumCacheTTL: 60,
  },
} as unknown as Parameters<typeof imageOptimizer>[2]

const paramsResult = {
  href: 'https://example.com/test.jpg',
  width: 64,
  quality: 75,
  mimeType: '',
} as Parameters<typeof imageOptimizer>[1]

describe('imageOptimizer maxAge with previously cached image', () => {
  it('reflects the new upstream Cache-Control when reusing an unchanged cached image', async () => {
    const buffer = await readFile(join(__dirname, './images/test.jpg'))
    const upstreamEtag = getImageEtag(buffer)

    // The previous cache entry was written when the upstream advertised a long
    // TTL (1 year). The optimized etag differs from the upstream etag so the
    // entry is eligible for reuse.
    const previousCacheEntry = {
      isStale: true,
      isMiss: false,
      isFallback: false,
      revalidateAfter: 0,
      cacheControl: { revalidate: 31536000, expire: undefined },
      value: {
        kind: CachedRouteKind.IMAGE,
        upstreamEtag,
        etag: 'optimized-etag',
        buffer,
        extension: 'jpeg',
      },
    } as unknown as IncrementalResponseCacheEntry

    // On revalidation the upstream is re-fetched and now advertises a much
    // shorter TTL. The source bytes are unchanged (same upstream etag) so the
    // optimized buffer is reused, but the returned maxAge must reflect the new
    // upstream header (300), not the stale persisted value (31536000).
    const result = await imageOptimizer(
      {
        buffer,
        contentType: 'image/jpeg',
        cacheControl: 'max-age=300',
        etag: upstreamEtag,
      },
      paramsResult,
      nextConfig,
      { silent: true, previousCacheEntry }
    )

    // Optimization was skipped: the previously optimized image is reused.
    expect(result.etag).toBe('optimized-etag')
    expect(result.upstreamEtag).toBe(upstreamEtag)
    // The TTL reflects the freshly fetched upstream Cache-Control header.
    expect(result.maxAge).toBe(300)
  })

  it('clamps the reused maxAge to minimumCacheTTL', async () => {
    const buffer = await readFile(join(__dirname, './images/test.jpg'))
    const upstreamEtag = getImageEtag(buffer)

    const previousCacheEntry = {
      isStale: true,
      isMiss: false,
      isFallback: false,
      revalidateAfter: 0,
      cacheControl: { revalidate: 31536000, expire: undefined },
      value: {
        kind: CachedRouteKind.IMAGE,
        upstreamEtag,
        etag: 'optimized-etag',
        buffer,
        extension: 'jpeg',
      },
    } as unknown as IncrementalResponseCacheEntry

    // Upstream advertises a TTL below minimumCacheTTL (60), so the result is
    // clamped up to minimumCacheTTL.
    const result = await imageOptimizer(
      {
        buffer,
        contentType: 'image/jpeg',
        cacheControl: 'max-age=5',
        etag: upstreamEtag,
      },
      paramsResult,
      nextConfig,
      { silent: true, previousCacheEntry }
    )

    expect(result.etag).toBe('optimized-etag')
    expect(result.maxAge).toBe(60)
  })
})
