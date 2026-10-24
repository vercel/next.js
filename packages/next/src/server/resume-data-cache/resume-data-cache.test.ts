import {
  deflateResumeDataCache,
  stringifyResumeDataCache,
  createRenderResumeDataCache,
} from './resume-data-cache'
import { createPrerenderResumeDataCache } from './resume-data-cache'
import { FALLBACK_PARAMS, RUNTIME_DATA, SESSION_DATA } from './cache-store'
import { streamFromString } from '../stream-utils/node-web-streams-helper'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

function createMockedCache() {
  const cache = createPrerenderResumeDataCache()
  // Omission reasons are only carried between passes of this prerender, never
  // into the persisted cache used by a later request.
  cache.cache.set('fallback-hole', FALLBACK_PARAMS)
  cache.cache.set('runtime-hole', RUNTIME_DATA)
  cache.cache.set('session-hole', SESSION_DATA)

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

describe('createPrerenderResumeDataCache', () => {
  it('copies entries and hole markers without changing the seed', () => {
    const seed = createMockedCache()
    const clone = createPrerenderResumeDataCache(seed)

    expect(clone.cache).not.toBe(seed.cache)
    expect(clone.cache).toEqual(seed.cache)
    clone.cache.set('success', FALLBACK_PARAMS)
    clone.cache.set('fallback-hole', RUNTIME_DATA)
    expect(seed.cache.get('success')).toBeInstanceOf(Promise)
    expect(seed.cache.get('fallback-hole')).toBe(FALLBACK_PARAMS)
    expect(clone.cache.get('runtime-hole')).toBe(RUNTIME_DATA)
    expect(clone.cache.get('session-hole')).toBe(SESSION_DATA)
  })

  it('keeps hole markers when converting to a read-only in-memory cache', () => {
    const cache = createMockedCache()
    const renderCache = createRenderResumeDataCache(cache)

    expect(renderCache.mutable).toBe(false)
    expect(renderCache.cache.get('fallback-hole')).toBe(FALLBACK_PARAMS)
    expect(renderCache.cache.get('runtime-hole')).toBe(RUNTIME_DATA)
    expect(renderCache.cache.get('session-hole')).toBe(SESSION_DATA)
  })
})

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

  it('serializes a successful fill that replaced a hole marker', async () => {
    const cache = createMockedCache()
    const successfulEntry = cache.cache.get('success')!
    cache.cache.set('fallback-hole', successfulEntry)
    cache.cache.set('runtime-hole', successfulEntry)

    const serialized = await stringifyResumeDataCache(
      cache,
      isCacheComponentsEnabled
    )
    const parsed = createRenderResumeDataCache(serialized, undefined, true)

    expect(parsed.cache.get('fallback-hole')).toBeInstanceOf(Promise)
    expect(parsed.cache.get('runtime-hole')).toBeInstanceOf(Promise)
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
  it('throws in the edge runtime before handling an uncompressed cache', () => {
    const nextRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'edge'

    try {
      expect(() =>
        createRenderResumeDataCache('null', undefined, true)
      ).toThrow(
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
    const parsed = createRenderResumeDataCache('null', undefined)
    expect(parsed.cache).toEqual(new Map())
    expect(parsed.fetch).toEqual(new Map())
    expect(parsed.encryptedBoundArgs).toEqual(new Map())
    expect(parsed.decryptedBoundArgs).toEqual(new Map())
  })

  it.each([false, true])(
    'parses a filled cache with compression disabled: %s',
    async (disableResumeDataCacheCompression) => {
      const cache = createMockedCache()
      const serialized = await stringifyResumeDataCache(
        cache,
        isCacheComponentsEnabled
      )

      const persisted = disableResumeDataCacheCompression
        ? serialized
        : deflateResumeDataCache(serialized)
      const parsed = createRenderResumeDataCache(
        persisted,
        undefined,
        disableResumeDataCacheCompression
      )

      expect(parsed.cache.size).toBe(isCacheComponentsEnabled ? 1 : 3)
      expect(parsed.fetch.size).toBe(0)
      expect(parsed.cache.has('fallback-hole')).toBe(false)
      expect(parsed.cache.has('runtime-hole')).toBe(false)
      expect(parsed.cache.has('session-hole')).toBe(false)
    }
  )

  it.each([false, true])(
    'omits all hole markers with compression disabled: %s',
    async (disableResumeDataCacheCompression) => {
      const cache = createPrerenderResumeDataCache()
      cache.cache.set('fallback-hole', FALLBACK_PARAMS)
      cache.cache.set('runtime-hole', RUNTIME_DATA)
      cache.cache.set('session-hole', SESSION_DATA)

      const serialized = await stringifyResumeDataCache(
        cache,
        isCacheComponentsEnabled
      )
      const persisted = disableResumeDataCacheCompression
        ? serialized
        : deflateResumeDataCache(serialized)
      const parsed = createRenderResumeDataCache(
        persisted,
        undefined,
        disableResumeDataCacheCompression
      )

      expect(parsed.cache.size).toBe(0)
      expect(cache.cache.get('fallback-hole')).toBe(FALLBACK_PARAMS)
      expect(cache.cache.get('runtime-hole')).toBe(RUNTIME_DATA)
      expect(cache.cache.get('session-hole')).toBe(SESSION_DATA)
    }
  )
})
