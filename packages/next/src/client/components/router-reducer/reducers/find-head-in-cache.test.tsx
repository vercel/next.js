import type {
  FlightRouterState,
  CacheNode,
} from '../../../../shared/lib/app-router-types'
import { findHeadInCache } from './find-head-in-cache'

const navigatedAt = -1

describe('findHeadInCache', () => {
  it('should find the head', () => {
    const routerTree: FlightRouterState = [
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
      undefined,
      undefined,
      true,
    ]

    const cache: CacheNode = {
      navigatedAt,
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
                navigatedAt,
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
                        'about',
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
                                    rsc: null,
                                    prefetchRsc: null,
                                    prefetchHead: null,
                                    loading: null,
                                    parallelRoutes: new Map(),
                                    head: null,
                                  },
                                ],
                              ]),
                            ],
                          ]),
                          rsc: null,
                          prefetchRsc: null,
                        },
                      ],
                      // TODO-APP: this segment should be preserved when creating the new cache
                      // [
                      //   '',
                      //   {
                      //     lazyData: null,
                      //     rsc: <>Page</>,
                      //     prefetchRsc: null,
                      //     parallelRoutes: new Map(),
                      //   },
                      // ],
                    ]),
                  ],
                ]),
              },
            ],
          ]),
        ],
      ]),
    }

    const result = findHeadInCache(cache, routerTree[1])
    expect(result).not.toBeNull()

    const [cacheNode, key] = result!
    expect(cacheNode.head).toBe(null)
    expect(key).toBe('/linking/about/')
  })
})
