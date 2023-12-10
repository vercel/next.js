import React from 'react'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightData } from '../../../server/app-render/types'

const getFlightData = (): FlightData => {
  return [
    [
      [
        '',
        {
          children: [
            'linking',
            {
              children: [
                'about',
                {
                  children: ['', {}],
                },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ],
      ['', null, <h1>About Page!</h1>],
      <>
        <title>About page!</title>
      </>,
    ],
  ]
}

describe('fillLazyItemsTillLeafWithHead', () => {
  it('should fill lazy items till leaf with head', () => {
    const cache: CacheNode = {
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      data: null,
      subTreeData: <>Root layout</>,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                subTreeData: <>Linking</>,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          data: null,
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
    const [treePatch, cacheNodeSeedData, head] = flightDataPath.slice(-3)
    fillLazyItemsTillLeafWithHead(
      cache,
      existingCache,
      treePatch,
      cacheNodeSeedData,
      head
    )

    const expectedCache: CacheNode = {
      data: null,
      subTreeData: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                subTreeData: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        'about',
                        {
                          data: null,
                          parallelRoutes: new Map([
                            [
                              'children',
                              new Map([
                                [
                                  '',
                                  {
                                    data: null,
                                    subTreeData: null,
                                    parallelRoutes: new Map(),
                                    head: (
                                      <>
                                        <title>About page!</title>
                                      </>
                                    ),
                                  },
                                ],
                              ]),
                            ],
                          ]),
                          subTreeData: null,
                        },
                      ],
                      [
                        '',
                        {
                          data: null,
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

    expect(cache).toMatchObject(expectedCache)
  })
})
