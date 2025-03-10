import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { findHeadInCache } from './find-head-in-cache'

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
