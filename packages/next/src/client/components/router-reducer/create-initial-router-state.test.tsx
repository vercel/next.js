import React from 'react'
import type {
  FlightRouterState,
  CacheNode,
} from '../../../shared/lib/app-router-types'
import { createInitialRouterState } from './create-initial-router-state'

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

const navigatedAt = Date.now()

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
      navigatedAt,
      initialFlightData: [[initialTree, [children, {}, null]]],
      initialCanonicalUrlParts: initialCanonicalUrl.split('/'),
      initialRenderedSearch: '',
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      navigatedAt,
      initialFlightData: [[initialTree, [children, {}, null]]],
      initialCanonicalUrlParts: initialCanonicalUrl.split('/'),
      initialRenderedSearch: '',
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const expectedCache: CacheNode = {
      navigatedAt,
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
                navigatedAt,
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
      renderedSearch: '',
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
      previousNextUrl: null,
      debugInfo: null,
    }

    expect(state).toMatchObject(expected)
    expect(state2).toMatchObject(expected)
  })
})
