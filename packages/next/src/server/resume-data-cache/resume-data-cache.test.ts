import {
  stringifyResumeDataCache,
  createRenderResumeDataCache,
} from './resume-data-cache'
import { createPrerenderResumeDataCache } from './resume-data-cache'
import { streamFromString } from '../stream-utils/node-web-streams-helper'
import { inflateSync } from 'node:zlib'

async function createCacheWithSingleEntry() {
  const cache = createPrerenderResumeDataCache()
  await cache.cache.set(
    'original-key',
    Promise.resolve({
      key: 'final-key',
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

async function createCacheWithEntriesThatFail() {
  const cache = await createCacheWithSingleEntry()

  await cache.cache.set(
    'fail-promise',
    Promise.reject(new Error('Failed to serialize'))
  )

  await cache.cache.set(
    'fail-stream',
    Promise.resolve({
      key: 'fail-stream',
      value: new ReadableStream({
        start(controller) {
          controller.error(new Error('Failed to serialize'))
        },
      }),
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
    const cache = await createCacheWithSingleEntry()
    const compressed = await stringifyResumeDataCache(cache)

    // We have to decompress the output because the compressed string is not
    // deterministic. If it fails here it's because the compressed string is
    // different.
    const decompressed = inflateSync(
      Buffer.from(compressed, 'base64')
    ).toString('utf-8')

    expect(decompressed).toMatchInlineSnapshot(
      `"{"store":{"fetch":{},"cache":{"final-key":{"key":"final-key","value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":0,"revalidate":0}},"encryptedBoundArgs":{}}}"`
    )
  })

  it('serializes a cache with entries that fail', async () => {
    const cache = await createCacheWithEntriesThatFail()
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
      `"{"store":{"fetch":{},"cache":{"final-key":{"key":"final-key","value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":0,"revalidate":0}},"encryptedBoundArgs":{}}}"`
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
    const cache = await createCacheWithSingleEntry()
    const serialized = await stringifyResumeDataCache(cache)

    const parsed = createRenderResumeDataCache(serialized)

    expect(await parsed.cache.getSize()).toBe(1)
    expect(parsed.fetch.size).toBe(0)
  })
})
