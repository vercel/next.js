/* eslint-env jest */
import {
  getPreviouslyCachedImageOrNull,
  getImageEtag,
} from 'next/dist/server/image-optimizer'
import {
  CachedRouteKind,
  IncrementalCacheItem,
} from 'next/dist/server/response-cache/types'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImageUpstream = async (filepath, contentType = 'image/jpeg') => {
  const buffer = await readFile(join(__dirname, filepath))
  const result: Parameters<typeof getPreviouslyCachedImageOrNull>[0] = {
    buffer,
    contentType,
    cacheControl: 'max-age=31536000',
    etag: getImageEtag(buffer),
  }
  return result
}
const baseCacheEntry = {
  revalidateAfter: Date.now() + 1000,
  curRevalidate: Date.now() + 500,
  revalidate: Date.now() + 1000,

  isStale: false,
  isMiss: false,
  isFallback: false,
} as const

const getPreviousCacheEntry = async (
  filepath,
  extension = 'jpeg',
  optimizedEtag = true
) => {
  const buffer = await readFile(join(__dirname, filepath))
  const upstreamEtag = getImageEtag(buffer)
  const result: IncrementalCacheItem = {
    ...baseCacheEntry,
    value: {
      kind: CachedRouteKind.IMAGE,
      upstreamEtag,
      etag: optimizedEtag ? 'optimized-etag' : upstreamEtag,
      buffer,
      extension,
    },
  }
  return result
}

describe('shouldUsePreviouslyCachedEntry', () => {
  it('should return the cached image if the upstream image matches previous cache entry upstream etag and not the optimized etag', async () => {
    const previousEntry = await getPreviousCacheEntry('./images/test.jpg')
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        previousEntry
      )
    ).toEqual(previousEntry.value)
  })

  it('should return null if previous cache entry value is not of kind IMAGE', async () => {
    const nonImageCacheEntry: IncrementalCacheItem = {
      ...baseCacheEntry,
      value: { kind: CachedRouteKind.REDIRECT, props: {} },
    }
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        nonImageCacheEntry
      )
    ).toBe(null)
  })

  it('should return null if upstream image does not match previous cache entry upstream etag', async () => {
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.png', 'image/png'),
        await getPreviousCacheEntry('./images/test.jpg')
      )
    ).toBe(null)
  })

  it('should return null if upstream image matches optimized etag', async () => {
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        await getPreviousCacheEntry('./images/test.jpg', 'jpeg', false)
      )
    ).toBe(null)
  })

  it('should return null if previous cache entry is undefined', async () => {
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        undefined
      )
    ).toBe(null)
  })

  it('should return null if previous cache entry is null', async () => {
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        null
      )
    ).toBe(null)
  })

  it('should return null if previous cache entry value is null', async () => {
    const nullValueCacheEntry = { ...baseCacheEntry, value: null }
    expect(
      getPreviouslyCachedImageOrNull(
        await getImageUpstream('./images/test.jpg'),
        nullValueCacheEntry
      )
    ).toBe(null)
  })
})
