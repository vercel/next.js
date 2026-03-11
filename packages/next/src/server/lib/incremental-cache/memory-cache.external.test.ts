import type { CacheHandlerValue } from '.'
import { CachedRouteKind } from '../../response-cache/types'
import { getMemoryCache } from './memory-cache.external'

describe('getMemoryCache', () => {
  it('stores app-page entries with an empty html shell', () => {
    const cache = getMemoryCache(1024)
    const entry: CacheHandlerValue = {
      lastModified: Date.now(),
      value: {
        kind: CachedRouteKind.APP_PAGE,
        html: '',
        rscData: undefined,
        status: 200,
        postponed: 'postponed-state',
        headers: undefined,
        segmentData: undefined,
      },
    }

    expect(() => cache.set('/shell', entry)).not.toThrow()
    expect(cache.get('/shell')).toEqual(entry)
  })
})
