import React from 'react'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { CacheStates, CacheNode } from '../../../shared/lib/app-router-context'
import { FlightRouterState } from '../../../server/app-render'

describe('invalidateCacheByRouterState', () => {
  it('should invalidate the cache by router state', () => {
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
      data: null,
      status: CacheStates.LAZY_INITIALIZED,
      subTreeData: null,
      parallelRoutes: new Map([['children', new Map()]]),
    }

    expect(cache).toMatchObject(expectedCache)
  })
})
