import {
  stringifyResumeDataCache,
  createRenderResumeDataCache,
} from './resume-data-cache'
import { createPrerenderResumeDataCache } from './resume-data-cache'
import { streamFromString } from '../stream-utils/node-web-streams-helper'
import { inflateSync } from 'node:zlib'

function createCacheWithSingleEntry() {
  const cache = createPrerenderResumeDataCache()
  cache.cache.set(
    'key',
    Promise.resolve({
      value: streamFromString('value'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 0,
      revalidate: 0,
    })
  )

  return cache
}

describe('stringifyResumeDataCache', () => {
  it('serializes an empty cache', async () => {
    const cache = createPrerenderResumeDataCache()
    expect(await stringifyResumeDataCache(cache)).toBe('null')
  })

  it('serializes a cache with a single entry', async () => {
    const cache = createCacheWithSingleEntry()
    const compressed = await stringifyResumeDataCache(cache)

    // We have to decompress the output because the compressed string is not
    // deterministic. If it fails here it's because the compressed string is
    // different.
    const decompressed = inflateSync(
      Buffer.from(compressed, 'base64')
    ).toString('utf-8')

    expect(decompressed).toMatchInlineSnapshot(
      `"{"store":{"fetch":{},"cache":{"key":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":0,"revalidate":0}}}}"`
    )
  })
})

describe('parseResumeDataCache', () => {
  it('parses an empty cache', () => {
    expect(createRenderResumeDataCache('null')).toEqual(
      createPrerenderResumeDataCache()
    )
  })

  it('parses a cache with a single entry', async () => {
    const cache = createCacheWithSingleEntry()
    const serialized = await stringifyResumeDataCache(cache)

    const parsed = createRenderResumeDataCache(serialized)

    expect(parsed.cache.size).toBe(1)
    expect(parsed.fetch.size).toBe(0)
  })
})
