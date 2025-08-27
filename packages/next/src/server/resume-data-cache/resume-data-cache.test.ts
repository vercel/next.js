import {
  stringifyResumeDataCache,
  createRenderResumeDataCache,
} from './resume-data-cache'
import { createPrerenderResumeDataCache } from './resume-data-cache'
import { streamFromString } from '../stream-utils/node-web-streams-helper'
import { inflateSync } from 'node:zlib'

function createMockedCache() {
  const cache = createPrerenderResumeDataCache()

  // Should be included during serialization.
  cache.cache.set(
    'success',
    Promise.resolve({
      value: streamFromString('value'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 300,
      revalidate: 1,
    })
  )

  // Should be omitted during serialization.
  cache.cache.set(
    'dynamic-expire',
    Promise.resolve({
      value: streamFromString('value'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 299,
      revalidate: 1,
    })
  )

  // Should be omitted during serialization.
  cache.cache.set(
    'zero-revalidate',
    Promise.resolve({
      value: streamFromString('value'),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 300,
      revalidate: 0,
    })
  )

  return cache
}

function createMockedCacheWithEntryThatFails() {
  const cache = createMockedCache()
  cache.cache.set('fail', Promise.reject(new Error('Failed to serialize')))

  return cache
}

describe('stringifyResumeDataCache', () => {
  it('serializes an empty cache', async () => {
    const cache = createPrerenderResumeDataCache()
    expect(await stringifyResumeDataCache(cache)).toBe('null')
  })

  it('only serializes cache entries that were not excluded from the prerender result', async () => {
    const cache = createMockedCache()
    const compressed = await stringifyResumeDataCache(cache)

    // We have to decompress the output because the compressed string is not
    // deterministic. If it fails here it's because the compressed string is
    // different.
    const decompressed = inflateSync(
      Buffer.from(compressed, 'base64')
    ).toString('utf-8')

    expect(decompressed).toMatchInlineSnapshot(
      `"{"store":{"fetch":{},"cache":{"success":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1}},"encryptedBoundArgs":{}}}"`
    )
  })

  it('serializes a cache with an entry that fails', async () => {
    const cache = createMockedCacheWithEntryThatFails()
    const compressed = await stringifyResumeDataCache(cache)

    // We have to decompress the output because the compressed string is not
    // deterministic. If it fails here it's because the compressed string is
    // different.
    const decompressed = inflateSync(
      Buffer.from(compressed, 'base64')
    ).toString('utf-8')

    // We expect that the cache will still contain the successful entry but the
    // failed entry will be ignored and omitted from the output.
    expect(decompressed).toMatchInlineSnapshot(
      `"{"store":{"fetch":{},"cache":{"success":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1}},"encryptedBoundArgs":{}}}"`
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
    const cache = createMockedCache()
    const serialized = await stringifyResumeDataCache(cache)

    const parsed = createRenderResumeDataCache(serialized)

    expect(parsed.cache.size).toBe(1)
    expect(parsed.fetch.size).toBe(0)
  })
})
