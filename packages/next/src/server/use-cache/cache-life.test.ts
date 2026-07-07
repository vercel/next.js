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

  // Non-finite values other than Infinity (which means "never" and is
  // normalized) would serialize to null in cache entry metadata and silently
  // corrupt the cache life.
  it('rejects non-finite values other than Infinity', () => {
    const store = { type: 'cache' } as any

    expect(() => {
      workUnitAsyncStorage.run(store, () => {
        cacheLife({ revalidate: -Infinity })
      })
    }).toThrow(
      'Invalid `cacheLife()` option "revalidate" provided, expected a finite number of seconds or Infinity, received -Infinity.'
    )

    expect(() => {
      workUnitAsyncStorage.run(store, () => {
        cacheLife({ expire: NaN })
      })
    }).toThrow(
      'Invalid `cacheLife()` option "expire" provided, expected a finite number of seconds or Infinity, received NaN.'
    )

    expect(() => {
      workUnitAsyncStorage.run(store, () => {
        cacheLife({ stale: NaN })
      })
    }).toThrow(
      'Invalid `cacheLife()` option "stale" provided, expected a finite number of seconds or Infinity, received NaN.'
    )
  })
})
