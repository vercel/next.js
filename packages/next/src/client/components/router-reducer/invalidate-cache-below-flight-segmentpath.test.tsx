import React from 'react'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import type { NormalizedFlightData } from '../../flight-data-helpers'

const getFlightData = (): NormalizedFlightData[] => {
  return [
    {
      pathToSegment: ['children', 'linking', 'children'],
      segmentPath: ['children', 'linking', 'children', 'about'],
      segment: 'about',
      tree: ['about', { children: ['', {}] }],
      seedData: ['about', <h1>About Page!</h1>, {}, null, false],
      head: [null, '<title>About page!</title>'],
      isHeadPartial: false,
      isRootRender: false,
    },
  ]
}

describe('invalidateCacheBelowFlightSegmentPath', () => {
  it('should invalidate cache below flight segment path', () => {
    const cache: CacheNode = {
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      head: [null, null],
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      head: [null, null],
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                rsc: <>Linking</>,
                prefetchRsc: null,
                head: [null, null],
                prefetchHead: null,
                loading: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          lazyData: null,
                          rsc: <>Page</>,
                          prefetchRsc: null,
                          head: [null, null],
                          prefetchHead: null,
                          loading: null,
                          parallelRoutes: new Map(),
                        },
                      ],
                    ]),
                  ],
                ]),
              },
            ],
          ]),
        ],
      ]),
    }

    const flightData = getFlightData()

    if (typeof flightData === 'string') {
      throw new Error('invalid flight data')
    }

    // Mirrors the way router-reducer values are passed in.
    const normalizedFlightData = flightData[0]

    // Copy rsc for the root node of the cache.
    cache.rsc = existingCache.rsc
    cache.prefetchRsc = existingCache.prefetchRsc
    // Create a copy of the existing cache with the rsc applied.
    fillCacheWithNewSubTreeData(cache, existingCache, normalizedFlightData)

    // Invalidate the cache below the flight segment path. This should remove the 'about' node.
    invalidateCacheBelowFlightSegmentPath(
      cache,
      existingCache,
      normalizedFlightData.segmentPath
    )

    const expectedCache: CacheNode = {
      lazyData: null,
      head: [null, null],
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                head: [null, null],
                prefetchHead: null,
                loading: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          lazyData: null,
                          loading: null,
                          parallelRoutes: new Map(),
                          rsc: <React.Fragment>Page</React.Fragment>,
                          prefetchRsc: null,
                          head: [null, null],
                          prefetchHead: null,
                        },
                      ],
                    ]),
                  ],
                ]),
                rsc: <React.Fragment>Linking</React.Fragment>,
                prefetchRsc: null,
              },
            ],
          ]),
        ],
      ]),
      rsc: <>Root layout</>,
      prefetchRsc: null,
    }

    expect(cache).toMatchObject(expectedCache)
  })
})
