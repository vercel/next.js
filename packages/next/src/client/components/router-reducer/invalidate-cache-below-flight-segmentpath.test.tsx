import React from 'react'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import type { CacheNode } from '../../../shared/lib/app-router-types'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import type { NormalizedFlightData } from '../../flight-data-helpers'

const getFlightData = (): NormalizedFlightData[] => {
  return [
    {
      pathToSegment: ['children', 'linking', 'children'],
      segmentPath: ['children', 'linking', 'children', 'about'],
      segment: 'about',
      tree: ['about', { children: ['', {}] }],
      seedData: [<h1>About Page!</h1>, {}, null, false, false],
      head: null,
      isHeadPartial: false,
      isRootRender: false,
    },
  ]
}

const navigatedAt = Date.now()

describe('invalidateCacheBelowFlightSegmentPath', () => {
  it('should invalidate cache below flight segment path', () => {
    const cache: CacheNode = {
      navigatedAt,
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      navigatedAt,
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                navigatedAt,
                lazyData: null,
                rsc: <>Linking</>,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                loading: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          navigatedAt,
                          lazyData: null,
                          rsc: <>Page</>,
                          prefetchRsc: null,
                          head: null,
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
    fillCacheWithNewSubTreeData(
      navigatedAt,
      cache,
      existingCache,
      normalizedFlightData
    )

    // Invalidate the cache below the flight segment path. This should remove the 'about' node.
    invalidateCacheBelowFlightSegmentPath(
      cache,
      existingCache,
      normalizedFlightData.segmentPath
    )

    const expectedCache: CacheNode = {
      navigatedAt,
      lazyData: null,
      head: null,
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                navigatedAt,
                lazyData: null,
                head: null,
                prefetchHead: null,
                loading: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          navigatedAt,
                          lazyData: null,
                          loading: null,
                          parallelRoutes: new Map(),
                          rsc: <React.Fragment>Page</React.Fragment>,
                          prefetchRsc: null,
                          head: null,
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
