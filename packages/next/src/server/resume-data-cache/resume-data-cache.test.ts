import {
  stringifyResumeDataCache,
  createRenderResumeDataCache,
} from './resume-data-cache'
import { createPrerenderResumeDataCache } from './resume-data-cache'
import { streamFromString } from '../stream-utils/node-web-streams-helper'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

function createMockedCache() {
  const cache = createPrerenderResumeDataCache()

  // Should be included during serialization.
  cache.cache.set(
    'success',
    Promise.resolve({
      entry: {
        value: streamFromString('value'),
        tags: [],
        stale: 0,
        timestamp: 0,
        expire: 300,
        revalidate: 1,
      },
      hasExplicitRevalidate: true,
      hasExplicitExpire: true,
      readRootParamNames: undefined,
      dynamicNestedCacheError: undefined,
    })
  )

  // Should be omitted during serialization.
  cache.cache.set(
    'dynamic-expire',
    Promise.resolve({
      entry: {
        value: streamFromString('value'),
        tags: [],
        stale: 0,
        timestamp: 0,
        expire: 299,
        revalidate: 1,
      },
      hasExplicitRevalidate: true,
      hasExplicitExpire: true,
      readRootParamNames: undefined,
      dynamicNestedCacheError: undefined,
    })
  )

  // Should be omitted during serialization.
  cache.cache.set(
    'zero-revalidate',
    Promise.resolve({
      entry: {
        value: streamFromString('value'),
        tags: [],
        stale: 0,
        timestamp: 0,
        expire: 300,
        revalidate: 0,
      },
      hasExplicitRevalidate: true,
      hasExplicitExpire: true,
      readRootParamNames: undefined,
      dynamicNestedCacheError: undefined,
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
  it('throws in the edge runtime before serializing an empty cache', async () => {
    const nextRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'edge'

    try {
      await expect(
        stringifyResumeDataCache(
          createPrerenderResumeDataCache(),
          isCacheComponentsEnabled
        )
      ).rejects.toThrow(
        '`stringifyResumeDataCache` should not be called in edge runtime.'
      )
    } finally {
      if (nextRuntime === undefined) {
        delete process.env.NEXT_RUNTIME
      } else {
        process.env.NEXT_RUNTIME = nextRuntime
      }
    }
  })

  it('serializes an empty cache', async () => {
    const cache = createPrerenderResumeDataCache()
    expect(
      await stringifyResumeDataCache(cache, isCacheComponentsEnabled)
    ).toBe('null')
  })

  it('only serializes cache entries that were not excluded from the prerender result', async () => {
    const cache = createMockedCache()

    const serialized = await stringifyResumeDataCache(
      cache,
      isCacheComponentsEnabled
    )

    if (isCacheComponentsEnabled) {
      expect(serialized).toMatchInlineSnapshot(
        `"{"store":{"fetch":{},"cache":{"success":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1}},"encryptedBoundArgs":{}}}"`
      )
    } else {
      expect(serialized).toMatchInlineSnapshot(
        `"{"store":{"fetch":{},"cache":{"success":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1},"hasExplicitRevalidate":true,"hasExplicitExpire":true},"dynamic-expire":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":299,"revalidate":1},"hasExplicitRevalidate":true,"hasExplicitExpire":true},"zero-revalidate":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":0},"hasExplicitRevalidate":true,"hasExplicitExpire":true}},"encryptedBoundArgs":{}}}"`
      )
    }
  })

  it('serializes a cache with an entry that fails', async () => {
    const cache = createMockedCacheWithEntryThatFails()

    const serialized = await stringifyResumeDataCache(
      cache,
      isCacheComponentsEnabled
    )

    // We expect that the cache will still contain the successful entries
    // but the failed entry will be ignored and omitted from the output.
    if (isCacheComponentsEnabled) {
      expect(serialized).toMatchInlineSnapshot(
        `"{"store":{"fetch":{},"cache":{"success":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1}},"encryptedBoundArgs":{}}}"`
      )
    } else {
      expect(serialized).toMatchInlineSnapshot(
        `"{"store":{"fetch":{},"cache":{"success":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":1},"hasExplicitRevalidate":true,"hasExplicitExpire":true},"dynamic-expire":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":299,"revalidate":1},"hasExplicitRevalidate":true,"hasExplicitExpire":true},"zero-revalidate":{"entry":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":300,"revalidate":0},"hasExplicitRevalidate":true,"hasExplicitExpire":true}},"encryptedBoundArgs":{}}}"`
      )
    }
  })
})

describe('parseResumeDataCache', () => {
  it('throws in the edge runtime before parsing an empty cache', () => {
    const nextRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'edge'

    try {
      expect(() => createRenderResumeDataCache('null')).toThrow(
        '`createRenderResumeDataCache` should not be called in edge runtime.'
      )
    } finally {
      if (nextRuntime === undefined) {
        delete process.env.NEXT_RUNTIME
      } else {
        process.env.NEXT_RUNTIME = nextRuntime
      }
    }
  })

  it('parses an empty cache', () => {
    const parsed = createRenderResumeDataCache('null')
    expect(parsed.cache).toEqual(new Map())
    expect(parsed.fetch).toEqual(new Map())
    expect(parsed.encryptedBoundArgs).toEqual(new Map())
    expect(parsed.decryptedBoundArgs).toEqual(new Map())
    expect(parsed.dynamicCacheKeys).toBeUndefined()
  })

  it('parses a filled cache', async () => {
    const cache = createMockedCache()
    const serialized = await stringifyResumeDataCache(
      cache,
      isCacheComponentsEnabled
    )

    const parsed = createRenderResumeDataCache(serialized)

    expect(parsed.cache.size).toBe(isCacheComponentsEnabled ? 1 : 3)
    expect(parsed.fetch.size).toBe(0)
  })
})
