import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'

const MINIMAL_PRERENDER_MANIFEST = {
  version: 4 as const,
  routes: {},
  dynamicRoutes: {},
  preview: {
    previewModeEncryptionKey: '',
    previewModeId: '',
    previewModeSigningKey: '',
  },
  notFoundRoutes: [],
}

function makeCache(cacheKeyExcludedHeaders?: string[]): IncrementalCache {
  return new IncrementalCache({
    dev: false,
    requestHeaders: {},
    getPrerenderManifest: () => MINIMAL_PRERENDER_MANIFEST,
    cacheKeyExcludedHeaders,
  })
}

describe('generateCacheKey — cacheKeyExcludedHeaders', () => {
  const url = 'https://api.example.com/data'

  it('excluded header (global config): differing values → identical key', async () => {
    const cache = makeCache(['x-request-id'])

    const key1 = await cache.generateCacheKey(url, {
      headers: { 'x-request-id': 'aaa', accept: 'application/json' },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { 'x-request-id': 'bbb', accept: 'application/json' },
    })

    expect(key1).toBe(key2)
  })

  it('non-excluded header: differing values → different key', async () => {
    const cache = makeCache(['x-request-id'])

    const key1 = await cache.generateCacheKey(url, {
      headers: { 'x-custom': 'foo' },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { 'x-custom': 'bar' },
    })

    expect(key1).not.toBe(key2)
  })

  it('built-ins (traceparent/tracestate) are excluded with no config set', async () => {
    const cache = makeCache()

    const key1 = await cache.generateCacheKey(url, {
      headers: { traceparent: '00-abc-def-01', tracestate: 'rojo=1' },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { traceparent: '00-xyz-uvw-02', tracestate: 'congo=2' },
    })

    expect(key1).toBe(key2)
  })

  it('case-insensitive: global config "Sentry-Trace" excludes "sentry-trace" header', async () => {
    const cache = makeCache(['Sentry-Trace'])

    const key1 = await cache.generateCacheKey(url, {
      headers: { 'sentry-trace': 'value-a' },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { 'sentry-trace': 'value-b' },
    })

    expect(key1).toBe(key2)
  })

  it('per-fetch list is additive to the global list: both applied together', async () => {
    const cache = makeCache(['x-global-exclude'])

    // Both global and per-fetch headers are varied; key should be identical
    // because both are excluded.
    const key1 = await cache.generateCacheKey(url, {
      headers: { 'x-global-exclude': 'g1', 'x-perfetch-exclude': 'p1' },
      next: { cacheKeyExcludedHeaders: ['x-perfetch-exclude'] },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { 'x-global-exclude': 'g2', 'x-perfetch-exclude': 'p2' },
      next: { cacheKeyExcludedHeaders: ['x-perfetch-exclude'] },
    })

    expect(key1).toBe(key2)

    // Non-excluded header still differentiates keys
    const key3 = await cache.generateCacheKey(url, {
      headers: {
        'x-global-exclude': 'g1',
        'x-perfetch-exclude': 'p1',
        'x-other': 'o1',
      },
      next: { cacheKeyExcludedHeaders: ['x-perfetch-exclude'] },
    })
    const key4 = await cache.generateCacheKey(url, {
      headers: {
        'x-global-exclude': 'g1',
        'x-perfetch-exclude': 'p1',
        'x-other': 'o2',
      },
      next: { cacheKeyExcludedHeaders: ['x-perfetch-exclude'] },
    })

    expect(key3).not.toBe(key4)
  })

  it('Request-input path: new Request(url, {next:{cacheKeyExcludedHeaders}}) respects exclusion', async () => {
    const cache = makeCache()

    // Pass a Request object rather than a plain RequestInit — the historically
    // fragile branch (patch-fetch.ts isRequestInput === true).
    const req1 = new Request(url, {
      headers: { 'x-trace': 'val-a', accept: 'text/plain' },
    })
    ;(req1 as any).next = { cacheKeyExcludedHeaders: ['x-trace'] }

    const req2 = new Request(url, {
      headers: { 'x-trace': 'val-b', accept: 'text/plain' },
    })
    ;(req2 as any).next = { cacheKeyExcludedHeaders: ['x-trace'] }

    const key1 = await cache.generateCacheKey(url, req1 as any)
    const key2 = await cache.generateCacheKey(url, req2 as any)

    expect(key1).toBe(key2)
  })

  it('built-in header in config (e.g. ["traceparent"]) is harmless — no error, still excluded', async () => {
    // Passing a built-in in the config should not throw and the header should
    // still be excluded (Set deduplication keeps exactly one entry).
    const cache = makeCache(['traceparent'])

    await expect(
      cache.generateCacheKey(url, {
        headers: { traceparent: '00-abc-def-01' },
      })
    ).resolves.toEqual(expect.any(String))

    const key1 = await cache.generateCacheKey(url, {
      headers: { traceparent: 'v1' },
    })
    const key2 = await cache.generateCacheKey(url, {
      headers: { traceparent: 'v2' },
    })

    expect(key1).toBe(key2)
  })

  it('determinism: same inputs produce the same key across two calls', async () => {
    const cache = makeCache(['x-request-id'])

    const init = {
      method: 'GET',
      headers: { 'x-request-id': 'ignored', accept: 'application/json' },
    }

    const key1 = await cache.generateCacheKey(url, init)
    const key2 = await cache.generateCacheKey(url, init)

    expect(key1).toBe(key2)
  })
})
