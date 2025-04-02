import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { NormalizedFlightData } from '../../flight-data-helpers'

const getFlightData = (): NormalizedFlightData[] => {
  return [
    {
      pathToSegment: ['children', 'linking', 'children'],
      segmentPath: ['children', 'linking', 'children', 'about'],
      segment: 'about',
      tree: ['about', { children: ['', {}] }],
      seedData: ['about', <h1>SubTreeData Injected!</h1>, {}, null, false],
      head: null,
      isHeadPartial: false,
      isRootRender: false,
    },
  ]
}

describe('fillCacheWithNewSubtreeData', () => {
  it('should apply rsc and head property', () => {
    const cache: CacheNode = {
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
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

    fillCacheWithNewSubTreeData(cache, existingCache, normalizedFlightData)

    const expectedCache: CacheNode = {
      lazyData: null,
      rsc: null,
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
                      // TODO-APP: this segment should be preserved when creating the new cache
                      [
                        '',
                        {
                          lazyData: null,
                          rsc: <>Page</>,
                          prefetchRsc: null,
                          head: null,
                          prefetchHead: null,
                          loading: null,
                          parallelRoutes: new Map(),
                        },
                      ],
                      [
                        'about',
                        {
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
                                    lazyData: null,
                                    rsc: null,
                                    prefetchRsc: null,
                                    parallelRoutes: new Map(),
                                    prefetchHead: null,
                                    loading: null,
                                    head: null,
                                  },
                                ],
                              ]),
                            ],
                          ]),
                          rsc: <h1>SubTreeData Injected!</h1>,
                          prefetchRsc: null,
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
