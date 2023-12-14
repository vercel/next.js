import React from 'react'
import type { FlightData } from '../../../server/app-render/types'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'

const getFlightData = (): FlightData => {
  return [
    [
      'children',
      'linking',
      'children',
      'about',
      [
        'about',
        {
          children: ['', {}],
        },
      ],
      ['about', {}, <h1>About Page!</h1>],
      <>
        <title>About page!</title>
      </>,
    ],
  ]
}

describe('invalidateCacheBelowFlightSegmentPath', () => {
  it('should invalidate cache below flight segment path', () => {
    const cache: CacheNode = {
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
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
    const flightDataPath = flightData[0]
    const flightSegmentPath = flightDataPath.slice(0, -3)

    // Copy rsc for the root node of the cache.
    cache.rsc = existingCache.rsc
    cache.prefetchRsc = existingCache.prefetchRsc
    // Create a copy of the existing cache with the rsc applied.
    fillCacheWithNewSubTreeData(cache, existingCache, flightDataPath, false)

    // Invalidate the cache below the flight segment path. This should remove the 'about' node.
    invalidateCacheBelowFlightSegmentPath(
      cache,
      existingCache,
      flightSegmentPath
    )

    const expectedCache: CacheNode = {
      lazyData: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          lazyData: null,
                          parallelRoutes: new Map(),
                          rsc: <React.Fragment>Page</React.Fragment>,
                          prefetchRsc: null,
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
