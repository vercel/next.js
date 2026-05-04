import { INFINITE_CACHE } from '../../lib/constants'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { cacheLife } from './cache-life'

describe('cacheLife', () => {
  const originalUseCache = process.env.__NEXT_USE_CACHE

  beforeEach(() => {
    process.env.__NEXT_USE_CACHE = '1'
  })

  afterEach(() => {
    if (originalUseCache === undefined) {
      delete process.env.__NEXT_USE_CACHE
    } else {
      process.env.__NEXT_USE_CACHE = originalUseCache
    }
  })

  it('should normalize Infinity profile values', () => {
    const store = {
      type: 'cache',
      explicitStale: undefined,
      explicitRevalidate: undefined,
      explicitExpire: undefined,
    } as any

    workUnitAsyncStorage.run(store, () => {
      cacheLife({
        stale: Infinity,
        revalidate: Infinity,
        expire: Infinity,
      })
    })

    expect(store.explicitStale).toBe(INFINITE_CACHE)
    expect(store.explicitRevalidate).toBe(INFINITE_CACHE)
    expect(store.explicitExpire).toBe(INFINITE_CACHE)
  })

  it('should reject non-finite profile values except Infinity', () => {
    const store = {
      type: 'cache',
      explicitStale: undefined,
      explicitRevalidate: undefined,
      explicitExpire: undefined,
    } as any

    expect(() => {
      workUnitAsyncStorage.run(store, () => {
        cacheLife({
          revalidate: -Infinity,
        })
      })
    }).toThrow(/Invalid `cacheLife\(\)` option "revalidate" provided/)

    expect(() => {
      workUnitAsyncStorage.run(store, () => {
        cacheLife({
          expire: NaN,
        })
      })
    }).toThrow(/Invalid `cacheLife\(\)` option "expire" provided/)
  })
})
