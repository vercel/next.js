import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import type {
  CacheNode,
  FlightRouterState,
} from '../../../shared/lib/app-router-types'

const navigatedAt = -1

describe('invalidateCacheByRouterState', () => {
  it('should invalidate the cache by router state', () => {
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

    const routerState: FlightRouterState = [
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
    ]

    invalidateCacheByRouterState(cache, existingCache, routerState)

    const expectedCache: CacheNode = {
      navigatedAt,
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      loading: null,
      parallelRoutes: new Map([['children', new Map()]]),
    }

    expect(cache).toMatchObject(expectedCache)
  })
})
