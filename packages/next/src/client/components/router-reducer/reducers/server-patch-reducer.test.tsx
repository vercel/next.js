import React from 'react'
import { FlightData, FlightRouterState } from '../../../../server/app-render'
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import { createInitialRouterState } from '../create-initial-router-state'
import { ServerPatchAction, ACTION_SERVER_PATCH } from '../router-reducer-types'
import { serverPatchReducer } from './server-patch-reducer'

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
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })
    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      flightData,
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
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      initialTree,
      initialCanonicalUrl,
      children,
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })

    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      flightData,
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
