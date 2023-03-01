import React from 'react'
import { FlightRouterState } from '../../../../server/app-render'
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import { createInitialRouterState } from '../create-initial-router-state'
import { RestoreAction, ACTION_RESTORE } from '../router-reducer-types'
import { restoreReducer } from './restore-reducer'

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
      location: new URL('/linking', 'https://localhost') as any,
    })
    const action: RestoreAction = {
      type: ACTION_RESTORE,
      url: new URL('/linking/about', 'https://localhost'),
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
        null,
        null,
        true,
      ],
    }

    const newState = await runPromiseThrowChain(() =>
      restoreReducer(state, action)
    )

    const expectedState: ReturnType<typeof restoreReducer> = {
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
        null,
        null,
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

    const action: RestoreAction = {
      type: ACTION_RESTORE,
      url: new URL('/linking/about', 'https://localhost'),
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
        null,
        null,
        true,
      ],
    }

    await runPromiseThrowChain(() => restoreReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      restoreReducer(state2, action)
    )

    const expectedState: ReturnType<typeof restoreReducer> = {
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
        null,
        null,
        true,
      ],
    }

    expect(newState).toMatchObject(expectedState)
  })
})
