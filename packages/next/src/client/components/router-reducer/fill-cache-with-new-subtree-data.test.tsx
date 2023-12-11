import React from 'react'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightData } from '../../../server/app-render/types'

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
      ['about', null, <h1>SubTreeData Injected!</h1>],
      <>
        <title>Head Injected!</title>
      </>,
    ],
  ]
}

describe('fillCacheWithNewSubtreeData', () => {
  it('should apply subTreeData and head property', () => {
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

    fillCacheWithNewSubTreeData(cache, existingCache, flightDataPath, false)

    const expectedCache: CacheNode = {
      lazyData: null,
      subTreeData: null,
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
                      // TODO-APP: this segment should be preserved when creating the new cache
                      [
                        '',
                        {
                          lazyData: null,
                          subTreeData: <>Page</>,
                          parallelRoutes: new Map(),
                        },
                      ],
                      [
                        'about',
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
                                    subTreeData: null,
                                    parallelRoutes: new Map(),
                                    head: (
                                      <>
                                        <title>Head Injected!</title>
                                      </>
                                    ),
                                  },
                                ],
                              ]),
                            ],
                          ]),
                          subTreeData: <h1>SubTreeData Injected!</h1>,
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

    expect(cache).toMatchObject(expectedCache)
  })
})
