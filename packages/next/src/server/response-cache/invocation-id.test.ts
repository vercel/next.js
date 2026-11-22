import ResponseCache from './index'
import { CachedRouteKind, type ResponseCacheEntry } from './types'
import { RouteKind } from '../route-kind'
import RenderResult from '../render-result'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'

import {
  TTL_SENTINEL,
  createCacheKey,
  extractInvocationID,
  getValidatedInvocationID,
} from './invocation-id'

function mockIncrementalCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }
}

function makeCacheEntry(html: string): ResponseCacheEntry {
  return {
    value: {
      kind: CachedRouteKind.APP_PAGE,
      html: RenderResult.fromStatic(html, HTML_CONTENT_TYPE_HEADER),
      rscData: Buffer.from('rsc-payload'),
      postponed: undefined,
      status: 200,
      headers: undefined,
      segmentData: undefined,
    },
    cacheControl: { revalidate: 60, expire: undefined },
  } as ResponseCacheEntry
}

describe('getValidatedInvocationID', () => {
  it('rejects the reserved TTL sentinel so a client cannot spell the no-id slot', () => {
    expect(getValidatedInvocationID(TTL_SENTINEL)).toBeUndefined()
    expect(getValidatedInvocationID('__ttl_sentinel__')).toBeUndefined()
  })

  it('treats a missing, empty or non-string header as no id supplied', () => {
    expect(getValidatedInvocationID(undefined)).toBeUndefined()
    expect(getValidatedInvocationID('')).toBeUndefined()
    expect(getValidatedInvocationID(['inv-a'])).toBeUndefined()
  })

  it('rejects values that are not platform-shaped', () => {
    expect(getValidatedInvocationID('has space')).toBeUndefined()
    expect(getValidatedInvocationID('with\u0000separator')).toBeUndefined()
    expect(getValidatedInvocationID('a'.repeat(65))).toBeUndefined()
    expect(getValidatedInvocationID('/path/like')).toBeUndefined()
  })

  it('accepts a bounded, separator-free id unchanged', () => {
    expect(getValidatedInvocationID('inv-a')).toBe('inv-a')
    expect(getValidatedInvocationID('a'.repeat(64))).toBe('a'.repeat(64))
    expect(getValidatedInvocationID('0f3a9c21')).toBe('0f3a9c21')
  })
})

describe('invocation-id cache keys', () => {
  it('gives no-header requests and every validated id their own key', () => {
    const noHeaderKey = createCacheKey('/test', undefined)

    for (const formulaID of ['inv-a', 'inv-b', '0f3a9c21']) {
      const validated = getValidatedInvocationID(formulaID)
      expect(validated).toBe(formulaID)
      expect(createCacheKey('/test', validated)).not.toBe(noHeaderKey)
    }
  })

  it('routes a client-supplied sentinel to the no-id slot instead of a separate namespace', () => {
    // The aliasing this guards against: `?? TTL_SENTINEL` means a raw sentinel
    // string and an absent id are the same key...
    expect(createCacheKey('/test', TTL_SENTINEL)).toBe(
      createCacheKey('/test', undefined)
    )

    // ...so validation must collapse the client value onto the no-id path
    // rather than let it select an id-shaped key the caller never supplied.
    expect(createCacheKey('/test', getValidatedInvocationID(TTL_SENTINEL))).toBe(
      createCacheKey('/test', undefined)
    )
  })

  it('round-trips an id through the compound key and treats the sentinel slot as no-id', () => {
    expect(extractInvocationID(createCacheKey('/test', 'inv-a'))).toBe('inv-a')
    expect(extractInvocationID(createCacheKey('/test', undefined))).toBeUndefined()
  })
})

describe('response cache isolation between no-id and invocation-scoped requests', () => {
  const route = { kind: RouteKind.APP_PAGE, sourceRoute: '/test/page' }

  it('does not serve a no-id request from an invocation-scoped entry, nor evict it', async () => {
    const cache = new ResponseCache({ minimalMode: true, route })
    const incrementalCache = mockIncrementalCache()
    const responseGenerator = jest.fn(async () => makeCacheEntry('rendered'))

    // An invocation-scoped request populates its own slot.
    const scoped = await cache.get('/test', responseGenerator, {
      routeKind: RouteKind.APP_PAGE,
      incrementalCache,
      invocationID: 'inv-a',
    })
    expect(scoped).not.toBeNull()
    expect(responseGenerator).toHaveBeenCalledTimes(1)

    // A request with no invocation id must not reuse that entry.
    const noID = await cache.get('/test', responseGenerator, {
      routeKind: RouteKind.APP_PAGE,
      incrementalCache,
      invocationID: undefined,
    })
    expect(noID).not.toBeNull()
    expect(responseGenerator).toHaveBeenCalledTimes(2)

    // And it must not have evicted the invocation-scoped entry.
    await cache.get('/test', responseGenerator, {
      routeKind: RouteKind.APP_PAGE,
      incrementalCache,
      invocationID: 'inv-a',
    })
    expect(responseGenerator).toHaveBeenCalledTimes(2)
  })
})
