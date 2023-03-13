import React from 'react'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { CacheStates, CacheNode } from '../../../shared/lib/app-router-context'
import { FlightData } from '../../../server/app-render'

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
      <h1>About Page!</h1>,
      <>
        <title>About page!</title>
      </>,
    ],
  ]
}

describe('fillLazyItemsTillLeafWithHead', () => {
  it('should fill lazy items till leaf with head', () => {
    const cache: CacheNode = {
      status: CacheStates.LAZY_INITIALIZED,
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      data: null,
      status: CacheStates.READY,
      subTreeData: <>Root layout</>,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                status: CacheStates.READY,
                subTreeData: <>Linking</>,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          data: null,
                          status: CacheStates.READY,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [treePatch, _subTreeData, head] = flightDataPath.slice(-3)
    fillLazyItemsTillLeafWithHead(cache, existingCache, treePatch, head)

    const expectedCache: CacheNode = {
      data: null,
      status: CacheStates.LAZY_INITIALIZED,
      subTreeData: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                status: CacheStates.LAZY_INITIALIZED,
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
                                    status: CacheStates.LAZY_INITIALIZED,
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
                          status: CacheStates.LAZY_INITIALIZED,
                        },
                      ],
                      [
                        '',
                        {
                          data: null,
                          status: CacheStates.READY,
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
