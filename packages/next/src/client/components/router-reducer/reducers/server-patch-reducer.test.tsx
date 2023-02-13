import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type {
  FlightData,
  FlightRouterState,
} from '../../../../server/app-render'
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
    fetchServerResponse: (
      url: URL
    ): ReturnType<typeof fetchServerResponseType> => {
      if (url.pathname === '/linking/about') {
        return Promise.resolve([flightData, undefined])
      }

      throw new Error('unknown url in mock')
    },
  }
})
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import { createInitialRouterState } from '../create-initial-router-state'
import {
  ServerPatchAction,
  ACTION_SERVER_PATCH,
  NavigateAction,
  ACTION_NAVIGATE,
} from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'
import { serverPatchReducer } from './server-patch-reducer'

const flightDataForPatch: FlightData = [
  [
    'children',
    'linking',
    'children',
    'somewhere-else',
    [
      'somewhere-else',
      {
        children: ['', {}],
      },
    ],
    <h1>Somewhere Page!</h1>,
    <>
      <title>Somewhere page!</title>
    </>,
  ],
]

const getInitialRouterStateTree = (): FlightRouterState => [
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

describe('serverPatchReducer', () => {
  it('should apply server patch', async () => {
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
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })
    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      flightData: flightDataForPatch,
      previousTree: [
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
      overrideCanonicalUrl: undefined,
      cache: {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
      },
      mutable: {},
    }

    const newState = await runPromiseThrowChain(() =>
      serverPatchReducer(state, action)
    )

    const expectedState: ReturnType<typeof serverPatchReducer> = {
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
      },
      focusAndScrollRef: {
        apply: false,
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
                          'somewhere-else',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <h1>Somewhere Page!</h1>,
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
                                          <title>Somewhere page!</title>
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
              children: ['somewhere-else', { children: ['', {}] }],
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

  it('should apply server patch (concurrent)', async () => {
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
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })

    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      flightData: flightDataForPatch,
      previousTree: [
        '',
        {
          children: [
            'linking',
            {
              children: ['somewhere-else', { children: ['', {}] }],
            },
          ],
        },
        undefined,
        undefined,
        true,
      ],
      overrideCanonicalUrl: undefined,
      cache: {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
      },
      mutable: {},
    }

    await runPromiseThrowChain(() => serverPatchReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      serverPatchReducer(state2, action)
    )

    const expectedState: ReturnType<typeof serverPatchReducer> = {
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
      },
      focusAndScrollRef: {
        apply: false,
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

  it('should apply server patch without affecting focusAndScrollRef', async () => {
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

    const navigateAction: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
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

    const state = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL(initialCanonicalUrl, 'https://localhost') as any,
    })

    const stateAfterNavigate = await runPromiseThrowChain(() =>
      navigateReducer(state, navigateAction)
    )

    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      flightData: flightDataForPatch,
      previousTree: [
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
      overrideCanonicalUrl: undefined,
      cache: {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
      },
      mutable: {},
    }

    const newState = await runPromiseThrowChain(() =>
      serverPatchReducer(stateAfterNavigate, action)
    )

    const expectedState: ReturnType<typeof serverPatchReducer> = {
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
                        [
                          'somewhere-else',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <h1>Somewhere Page!</h1>,
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
                                          <title>Somewhere page!</title>
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
              children: ['somewhere-else', { children: ['', {}] }],
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
