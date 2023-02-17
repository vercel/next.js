import React from 'react'
import { FlightRouterState } from '../../../server/app-render'
import { CacheNode, CacheStates } from '../../../shared/lib/app-router-context'
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
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
      initialHead: <title>Test</title>,
    })

    console.log(initialParallelRoutes)

    const state2 = createInitialRouterState({
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
      initialHead: <title>Test</title>,
    })

    const expectedCache: CacheNode = {
      status: CacheStates.READY,
      data: null,
      subTreeData: children,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                status: CacheStates.LAZY_INITIALIZED,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          status: CacheStates.LAZY_INITIALIZED,
                          data: null,
                          subTreeData: null,
                          parallelRoutes: new Map(),
                          head: <title>Test</title>,
                        },
                      ],
                    ]),
                  ],
                ]),
                data: null,
                subTreeData: null,
              },
            ],
          ]),
        ],
      ]),
    }

    const expected: ReturnType<typeof createInitialRouterState> = {
      tree: initialTree,
      canonicalUrl: initialCanonicalUrl,
      prefetchCache: new Map(),
      pushRef: { pendingPush: false, mpaNavigation: false },
      focusAndScrollRef: { apply: false },
      cache: expectedCache,
    }

    expect(state).toMatchObject(expected)
    expect(state2).toMatchObject(expected)
  })
})
