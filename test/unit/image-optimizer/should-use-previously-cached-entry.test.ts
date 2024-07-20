/* eslint-env jest */
import {
  shouldUsePreviouslyCachedEntry,
  getImageEtag,
} from 'next/dist/server/image-optimizer'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImageUpstream = async (filepath, contentType = 'image/jpeg') => {
  const buffer = await readFile(join(__dirname, filepath))
  return {
    buffer,
    contentType,
    cacheControl: 'max-age=31536000',
    etag: getImageEtag(buffer),
  } satisfies Parameters<typeof shouldUsePreviouslyCachedEntry>[0]
}
const baseCacheEntry = {
  revalidateAfter: Date.now() + 1000,
  curRevalidate: Date.now() + 500,
  revalidate: Date.now() + 1000,

  isStale: false,
  isMiss: false,
} as const

const getPreviousCacheEntry = async (
  filepath,
  extension = 'jpeg',
  optimizedEtag = true
) => {
  const buffer = await readFile(join(__dirname, filepath))
  const upstreamEtag = getImageEtag(buffer)
  return {
    ...baseCacheEntry,
    value: {
      kind: 'IMAGE',
      upstreamEtag,
      etag: optimizedEtag ? 'optimized-etag' : upstreamEtag,
      buffer,
      extension,
    },
  } satisfies Parameters<typeof shouldUsePreviouslyCachedEntry>[1]
}

describe('shouldUsePreviouslyCachedEntry', () => {
  it('should return true if the upstream image matches previous cache entry upstream etag and not the optimized etag', async () => {
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        await getPreviousCacheEntry('./images/test.jpg')
      )
    ).toBe(true)
  })

  it('should return false if previous cache entry value is not of kind IMAGE', async () => {
    const nonImageCacheEntry = {
      ...baseCacheEntry,
      value: { kind: 'REDIRECT', props: {} },
    } satisfies Parameters<typeof shouldUsePreviouslyCachedEntry>[1]
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        nonImageCacheEntry
      )
    ).toBe(false)
  })

  it('should return false if upstream image does not match previous cache entry upstream etag', async () => {
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.png', 'image/png'),
        await getPreviousCacheEntry('./images/test.jpg')
      )
    ).toBe(false)
  })

  it('should return false if upstream image matches optimized etag', async () => {
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        await getPreviousCacheEntry('./images/test.jpg', 'jpeg', false)
      )
    ).toBe(false)
  })

  it('should return false if previous cache entry is undefined', async () => {
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        undefined
      )
    ).toBe(false)
  })

  it('should return false if previous cache entry is null', async () => {
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        null
      )
    ).toBe(false)
  })

  it('should return false if previous cache entry value is null', async () => {
    const nullValueCacheEntry = { ...baseCacheEntry, value: null }
    expect(
      shouldUsePreviouslyCachedEntry(
        await getImageUpstream('./images/test.jpg'),
        nullValueCacheEntry
      )
    ).toBe(false)
  })
})
