import React from 'react'
import type { FlightRouterState } from '../../../server/app-render/types'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from './create-initial-router-state'
import { PrefetchCacheEntryStatus, PrefetchKind } from './router-reducer-types'

const getInitialRouterStateTree = (): FlightRouterState => [
  '',
  {
    children: [
      'linking',
      {
        children: ['', {}],
      },
    ],
  },
  undefined,
  undefined,
  true,
]

describe('createInitialRouterState', () => {
  it('should return the correct initial router state', () => {
    const initialTree = getInitialRouterStateTree()
    const initialCanonicalUrl = '/linking'
    const children = (
      <html>
        <head></head>
        <body>Root layout</body>
      </html>
    )
    const initialParallelRoutes: CacheNode['parallelRoutes'] = new Map()

    const state = createInitialRouterState({
      initialFlightData: [[initialTree, ['', children, {}, null]]],
      initialCanonicalUrlParts: initialCanonicalUrl.split('/'),
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
      couldBeIntercepted: false,
      postponed: false,
      prerendered: false,
    })

    const state2 = createInitialRouterState({
      initialFlightData: [[initialTree, ['', children, {}, null]]],
      initialCanonicalUrlParts: initialCanonicalUrl.split('/'),
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
      couldBeIntercepted: false,
      postponed: false,
      prerendered: false,
    })

    const expectedCache: CacheNode = {
      lazyData: null,
      rsc: children,
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
                          loading: null,
                          head: null,
                          prefetchHead: null,
                        },
                      ],
                    ]),
                  ],
                ]),
                lazyData: null,
                rsc: null,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                loading: null,
              },
            ],
          ]),
        ],
      ]),
    }

    const expected: ReturnType<typeof createInitialRouterState> = {
      tree: initialTree,
      canonicalUrl: initialCanonicalUrl,
      prefetchCache: new Map([
        [
          '/linking',
          {
            key: '/linking',
            data: expect.any(Promise),
            prefetchTime: expect.any(Number),
            kind: PrefetchKind.AUTO,
            lastUsedTime: expect.any(Number),
            treeAtTimeOfPrefetch: initialTree,
            status: PrefetchCacheEntryStatus.fresh,
            url: new URL('/linking', 'https://localhost'),
            staleTime: -1,
          },
        ],
      ]),
      pushRef: {
        pendingPush: false,
        mpaNavigation: false,
        preserveCustomHistoryState: true,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      cache: expectedCache,
      nextUrl: '/linking',
    }

    expect(state).toMatchObject(expected)
    expect(state2).toMatchObject(expected)
  })
})
