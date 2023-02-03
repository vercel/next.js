import React from 'react'
import type { fetchServerResponse } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render'
jest.mock('../fetch-server-response', () => {
  const flightData: FlightData = [
    [
      'children',
      'linking',
      'children',
      'about',
      [
        'about',
        {
          children: ['', {}],
        },
      ],
      <h1>About Page!</h1>,
      <>
        <title>About page!</title>
      </>,
    ],
  ]
  return {
    fetchServerResponse: (url: URL): ReturnType<typeof fetchServerResponse> => {
      if (url.pathname === '/linking/about') {
        return Promise.resolve([flightData, undefined])
      }

      throw new Error('unknown url in mock')
    },
  }
})
import { FlightRouterState } from '../../../../server/app-render'
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import { createInitialRouterState } from '../create-initial-router-state'
import { NavigateAction, ACTION_NAVIGATE } from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'

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

async function runPromiseThrowChain(fn: any): Promise<any> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof Promise) {
      await err
      return await runPromiseThrowChain(fn)
    }

    throw err
  }
}

describe('navigateReducer', () => {
  it('should apply navigation', async () => {
    const initialTree = getInitialRouterStateTree()
    const initialCanonicalUrl = '/linking'
    const children = (
      <html>
        <head></head>
        <body>Root layout</body>
      </html>
    )
    const initialParallelRoutes: CacheNode['parallelRoutes'] = new Map([
      [
        'children',
        new Map([
          [
            'linking',
            {
              status: CacheStates.READY,
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        status: CacheStates.READY,
                        data: null,
                        subTreeData: <>Linking page</>,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              data: null,
              subTreeData: <>Linking layout level</>,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })
    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      navigateType: 'push',
      forceOptimisticNavigation: false,
      cache: {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
      },
      mutable: {},
    }

    const newState = await runPromiseThrowChain(() =>
      navigateReducer(state, action)
    )

    const expectedState: ReturnType<typeof navigateReducer> = {
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: true,
      },
      focusAndScrollRef: {
        apply: true,
      },
      canonicalUrl: '/linking/about',
      cache: {
        status: CacheStates.READY,
        data: null,
        subTreeData: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
        parallelRoutes: new Map([
          [
            'children',
            new Map([
              [
                'linking',
                {
                  status: CacheStates.READY,
                  parallelRoutes: new Map([
                    [
                      'children',
                      new Map([
                        [
                          '',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <>Linking page</>,
                            parallelRoutes: new Map(),
                          },
                        ],
                        [
                          'about',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <h1>About Page!</h1>,
                            parallelRoutes: new Map([
                              [
                                'children',
                                new Map([
                                  [
                                    '',
                                    {
                                      status: CacheStates.LAZY_INITIALIZED,
                                      data: null,
                                      head: (
                                        <>
                                          <title>About page!</title>
                                        </>
                                      ),
                                      parallelRoutes: new Map(),
                                      subTreeData: null,
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
                  data: null,
                  subTreeData: <>Linking layout level</>,
                },
              ],
            ]),
          ],
        ]),
      },
      tree: [
        '',
        {
          children: [
            'linking',
            {
              children: ['about', { children: ['', {}] }],
            },
          ],
        },
        undefined,
        undefined,
        true,
      ],
    }

    expect(newState).toMatchObject(expectedState)
  })

  it('should apply navigation when called twice (concurrent)', async () => {
    const initialTree = getInitialRouterStateTree()
    const initialCanonicalUrl = '/linking'
    const children = (
      <html>
        <head></head>
        <body>Root layout</body>
      </html>
    )
    const initialParallelRoutes: CacheNode['parallelRoutes'] = new Map([
      [
        'children',
        new Map([
          [
            'linking',
            {
              status: CacheStates.READY,
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        status: CacheStates.READY,
                        data: null,
                        subTreeData: <>Linking page</>,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              data: null,
              subTreeData: <>Linking layout level</>,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      navigateType: 'push',
      forceOptimisticNavigation: false,
      cache: {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
      },
      mutable: {},
    }

    await runPromiseThrowChain(() => navigateReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      navigateReducer(state2, action)
    )

    const expectedState: ReturnType<typeof navigateReducer> = {
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: true,
      },
      focusAndScrollRef: {
        apply: true,
      },
      canonicalUrl: '/linking/about',
      cache: {
        status: CacheStates.READY,
        data: null,
        subTreeData: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
        parallelRoutes: new Map([
          [
            'children',
            new Map([
              [
                'linking',
                {
                  status: CacheStates.READY,
                  parallelRoutes: new Map([
                    [
                      'children',
                      new Map([
                        [
                          '',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <>Linking page</>,
                            parallelRoutes: new Map(),
                          },
                        ],
                        [
                          'about',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <h1>About Page!</h1>,
                            parallelRoutes: new Map([
                              [
                                'children',
                                new Map([
                                  [
                                    '',
                                    {
                                      status: CacheStates.LAZY_INITIALIZED,
                                      data: null,
                                      head: (
                                        <>
                                          <title>About page!</title>
                                        </>
                                      ),
                                      parallelRoutes: new Map(),
                                      subTreeData: null,
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
                  data: null,
                  subTreeData: <>Linking layout level</>,
                },
              ],
            ]),
          ],
        ]),
      },
      tree: [
        '',
        {
          children: [
            'linking',
            {
              children: ['about', { children: ['', {}] }],
            },
          ],
        },
        undefined,
        undefined,
        true,
      ],
    }

    expect(newState).toMatchObject(expectedState)
  })
})
