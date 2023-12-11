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
      ['about', null, <h1>About Page!</h1>],
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
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      lazyData: null,
      subTreeData: <>Root layout</>,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                subTreeData: <>Linking</>,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          lazyData: null,
                          subTreeData: <>Page</>,
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

    // Copy subTreeData for the root node of the cache.
    cache.subTreeData = existingCache.subTreeData
    // Create a copy of the existing cache with the subTreeData applied.
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
                          subTreeData: <React.Fragment>Page</React.Fragment>,
                        },
                      ],
                    ]),
                  ],
                ]),
                subTreeData: <React.Fragment>Linking</React.Fragment>,
              },
            ],
          ]),
        ],
      ]),
      subTreeData: <>Root layout</>,
    }

    expect(cache).toMatchObject(expectedCache)
  })
})
