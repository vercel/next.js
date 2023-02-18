import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render'
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

const demographicsFlightData: FlightData = [
  [
    [
      '',
      {
        children: [
          'parallel-tab-bar',
          {
            audience: [
              'demographics',
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
    ],
    <html>
      <head></head>
      <body>Root layout from response</body>
    </html>,
    <>
      <title>Demographics Head</title>
    </>,
  ],
]

jest.mock('../fetch-server-response', () => {
  return {
    fetchServerResponse: (
      url: URL
    ): ReturnType<typeof fetchServerResponseType> => {
      if (url.pathname === '/linking/about') {
        return Promise.resolve([flightData, undefined])
      }

      if (url.pathname === '/parallel-tab-bar/demographics') {
        return Promise.resolve([demographicsFlightData, undefined])
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
import {
  NavigateAction,
  ACTION_NAVIGATE,
  ACTION_PREFETCH,
  PrefetchAction,
} from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'
import { prefetchReducer } from './prefetch-reducer'
import { fetchServerResponse } from '../fetch-server-response'

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
      initialHead: null,
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
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
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

  it('should apply navigation for external url (push)', async () => {
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
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const url = new URL('https://example.vercel.sh', 'https://localhost')
    const isExternalUrl = url.origin !== 'localhost'

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url,
      isExternalUrl,
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

    await runPromiseThrowChain(() => navigateReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      navigateReducer(state2, action)
    )

    const expectedState: ReturnType<typeof navigateReducer> = {
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: true,
        pendingPush: true,
      },
      focusAndScrollRef: {
        apply: false,
      },
      canonicalUrl: 'https://example.vercel.sh/',
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
              children: ['', {}],
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

  it('should apply navigation for external url (replace)', async () => {
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
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const url = new URL('https://example.vercel.sh', 'https://localhost')
    const isExternalUrl = url.origin !== 'localhost'

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url,
      isExternalUrl,
      locationSearch: '',
      navigateType: 'replace',
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
        mpaNavigation: true,
        pendingPush: false,
      },
      focusAndScrollRef: {
        apply: false,
      },
      canonicalUrl: 'https://example.vercel.sh/',
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
              children: ['', {}],
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

  it('should apply navigation for forceOptimisticNavigation', async () => {
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
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
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
      locationSearch: '',
      navigateType: 'push',
      forceOptimisticNavigation: true,
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
                            status: CacheStates.DATA_FETCH,
                            // Real promise is not needed here.
                            data: Promise.resolve() as any,
                            parallelRoutes: new Map(),
                            subTreeData: null,
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
              children: ['about', { children: ['', {}] }, undefined, 'refetch'],
            },
          ],
        },
        // TODO-APP: optimistic tree is wrong
        // undefined,
        // undefined,
        // true,
      ],
    }

    expect(newState).toMatchObject(expectedState)
  })

  it('should apply navigation with prefetched data', async () => {
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

    const url = new URL('/linking/about', 'https://localhost')
    const serverResponse = await fetchServerResponse(url, initialTree, true)
    const prefetchAction: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
      tree: initialTree,
      serverResponse,
    }

    const state = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    await runPromiseThrowChain(() => prefetchReducer(state, prefetchAction))

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    await runPromiseThrowChain(() => prefetchReducer(state2, prefetchAction))

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      navigateType: 'push',
      locationSearch: '',
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
      prefetchCache: new Map([
        [
          '/linking/about',
          {
            canonicalUrlOverride: undefined,
            flightData: [
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
                <React.Fragment>
                  <title>About page!</title>
                </React.Fragment>,
              ],
            ],
            tree: [
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
            ],
          },
        ],
      ]),
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
                            parallelRoutes: new Map([
                              [
                                'children',
                                new Map([
                                  [
                                    '',
                                    {
                                      status: CacheStates.LAZY_INITIALIZED,
                                      subTreeData: null,
                                      data: null,
                                      head: (
                                        <>
                                          <title>About page!</title>
                                        </>
                                      ),
                                      parallelRoutes: new Map(),
                                    },
                                  ],
                                ]),
                              ],
                            ]),
                            subTreeData: <h1>About Page!</h1>,
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

  it('should apply parallel routes navigation (concurrent)', async () => {
    const initialTree: FlightRouterState = [
      '',
      {
        children: [
          'parallel-tab-bar',
          {
            audience: ['', {}],
            views: ['', {}],
            children: ['', {}],
          },
        ],
      },
      null,
      null,
      true,
    ]

    const initialCanonicalUrl = '/parallel-tab-bar'
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
            'parallel-tab-bar',
            {
              status: CacheStates.READY,
              parallelRoutes: new Map([
                [
                  'audience',
                  new Map([
                    [
                      '',
                      {
                        status: CacheStates.READY,
                        data: null,
                        subTreeData: <>Audience Page</>,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
                [
                  'views',
                  new Map([
                    [
                      '',
                      {
                        status: CacheStates.READY,
                        data: null,
                        subTreeData: <>Views Page</>,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        status: CacheStates.READY,
                        data: null,
                        subTreeData: <>Children Page</>,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              data: null,
              subTreeData: <>Layout level</>,
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
      location: new URL('/parallel-tab-bar', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/parallel-tab-bar', 'https://localhost') as any,
    })

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/parallel-tab-bar/demographics', 'https://localhost'),
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
      canonicalUrl: '/parallel-tab-bar/demographics',
      cache: {
        status: CacheStates.READY,
        data: null,
        subTreeData: (
          <html>
            <head></head>
            <body>Root layout from response</body>
          </html>
        ),
        parallelRoutes: new Map([
          [
            'children',
            new Map([
              [
                'parallel-tab-bar',
                {
                  status: CacheStates.LAZY_INITIALIZED,
                  parallelRoutes: new Map([
                    [
                      'audience',
                      new Map([
                        [
                          '',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <>Audience Page</>,
                            parallelRoutes: new Map(),
                          },
                        ],
                        [
                          'demographics',
                          {
                            status: CacheStates.LAZY_INITIALIZED,
                            data: null,
                            subTreeData: null,
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
                                      head: (
                                        <>
                                          <title>Demographics Head</title>
                                        </>
                                      ),
                                    },
                                  ],
                                ]),
                              ],
                            ]),
                          },
                        ],
                      ]),
                    ],
                    [
                      'views',
                      new Map([
                        [
                          '',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <>Views Page</>,
                            parallelRoutes: new Map(),
                          },
                        ],
                      ]),
                    ],
                    [
                      'children',
                      new Map([
                        [
                          '',
                          {
                            status: CacheStates.READY,
                            data: null,
                            subTreeData: <>Children Page</>,
                            parallelRoutes: new Map(),
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
      },
      tree: [
        '',
        {
          children: [
            'parallel-tab-bar',
            {
              audience: ['demographics', { children: ['', {}] }],
              views: ['', {}],
              children: ['', {}],
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
