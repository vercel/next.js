import React from 'react'
import type { fetchServerResponse } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render/types'
import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from '../create-initial-router-state'
import { ACTION_REFRESH } from '../router-reducer-types'
import type { RefreshAction } from '../router-reducer-types'
import { refreshReducer } from './refresh-reducer'
const buildId = 'development'

jest.mock('../fetch-server-response', () => {
  const flightData: FlightData = [
    [
      [
        '',
        {
          children: [
            'linking',
            {
              children: ['', {}],
            },
          ],
        },
        null,
        null,
        true,
      ],
      [
        '',
        {},
        <html>
          <head></head>
          <body>
            <h1>Linking Page!</h1>
          </body>
        </html>,
      ],
      <>
        <title>Linking page!</title>
      </>,
    ],
  ]
  return {
    fetchServerResponse: (url: URL): ReturnType<typeof fetchServerResponse> => {
      if (url.pathname === '/linking') {
        return Promise.resolve([flightData, undefined])
      }

      throw new Error('unknown url in mock')
    },
  }
})

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

describe('refreshReducer', () => {
  it('should apply refresh', async () => {
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>Linking page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>Linking layout level</>,
              prefetchRsc: null,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })
    const action: RefreshAction = {
      type: ACTION_REFRESH,
      origin: new URL('/linking', 'https://localhost').origin,
    }

    const newState = await runPromiseThrowChain(() =>
      refreshReducer(state, action)
    )

    const expectedState: ReturnType<typeof refreshReducer> = {
      buildId,
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: false,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking',
      nextUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>
              <h1>Linking Page!</h1>
            </body>
          </html>
        ),
        prefetchRsc: null,
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
                            head: (
                              <>
                                <title>Linking page!</title>
                              </>
                            ),
                          },
                        ],
                      ]),
                    ],
                  ]),
                  lazyData: null,
                  rsc: null,
                  prefetchRsc: null,
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

  it('should apply refresh (concurrent)', async () => {
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>Linking page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>Linking layout level</>,
              prefetchRsc: null,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const action: RefreshAction = {
      type: ACTION_REFRESH,
      origin: new URL('/linking', 'https://localhost').origin,
    }

    await runPromiseThrowChain(() => refreshReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      refreshReducer(state2, action)
    )

    const expectedState: ReturnType<typeof refreshReducer> = {
      buildId,
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: false,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking',
      nextUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>
              <h1>Linking Page!</h1>
            </body>
          </html>
        ),
        prefetchRsc: null,
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
                            head: (
                              <>
                                <title>Linking page!</title>
                              </>
                            ),
                          },
                        ],
                      ]),
                    ],
                  ]),
                  lazyData: null,
                  rsc: null,
                  prefetchRsc: null,
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

  it('should invalidate all segments (concurrent)', async () => {
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>Linking page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>Linking layout level</>,
              prefetchRsc: null,
            },
          ],
          [
            'about',
            {
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>About page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>About layout level</>,
              prefetchRsc: null,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const action: RefreshAction = {
      type: ACTION_REFRESH,
      origin: new URL('/linking', 'https://localhost').origin,
    }

    await runPromiseThrowChain(() => refreshReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      refreshReducer(state2, action)
    )

    const expectedState: ReturnType<typeof refreshReducer> = {
      buildId,
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: false,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking',
      nextUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>
              <h1>Linking Page!</h1>
            </body>
          </html>
        ),
        prefetchRsc: null,
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
                            head: (
                              <>
                                <title>Linking page!</title>
                              </>
                            ),
                          },
                        ],
                      ]),
                    ],
                  ]),
                  lazyData: null,
                  rsc: null,
                  prefetchRsc: null,
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

  it('should invalidate prefetchCache (concurrent)', async () => {
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>Linking page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>Linking layout level</>,
              prefetchRsc: null,
            },
          ],
          [
            'about',
            {
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '',
                      {
                        lazyData: null,
                        rsc: <>About page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>About layout level</>,
              prefetchRsc: null,
            },
          ],
        ]),
      ],
    ])

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const action: RefreshAction = {
      type: ACTION_REFRESH,
      origin: new URL('/linking', 'https://localhost').origin,
    }

    await runPromiseThrowChain(() => refreshReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      refreshReducer(state2, action)
    )

    const expectedState: ReturnType<typeof refreshReducer> = {
      buildId,
      prefetchCache: new Map(),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: false,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking',
      nextUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>
              <h1>Linking Page!</h1>
            </body>
          </html>
        ),
        prefetchRsc: null,
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
                            head: (
                              <>
                                <title>Linking page!</title>
                              </>
                            ),
                          },
                        ],
                      ]),
                    ],
                  ]),
                  lazyData: null,
                  rsc: null,
                  prefetchRsc: null,
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
})
