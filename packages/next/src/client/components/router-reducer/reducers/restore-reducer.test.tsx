import React from 'react'
import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from '../create-initial-router-state'
import {
  ACTION_RESTORE,
  PrefetchCacheEntryStatus,
  PrefetchKind,
} from '../router-reducer-types'
import type { RestoreAction } from '../router-reducer-types'
import { restoreReducer } from './restore-reducer'

const buildId = 'development'

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
      buildId,
      prefetchCache: new Map([
        [
          '/linking',
          {
            key: '/linking',
            data: expect.any(Promise),
            prefetchTime: expect.any(Number),
            kind: PrefetchKind.AUTO,
            lastUsedTime: null,
            treeAtTimeOfPrefetch: initialTree,
            status: PrefetchCacheEntryStatus.fresh,
          },
        ],
      ]),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: true,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking/about',
      nextUrl: '/linking/about',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>Root layout</body>
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
      buildId,
      prefetchCache: new Map([
        [
          '/linking',
          {
            key: '/linking',
            data: expect.any(Promise),
            prefetchTime: expect.any(Number),
            kind: PrefetchKind.AUTO,
            lastUsedTime: null,
            treeAtTimeOfPrefetch: initialTree,
            status: PrefetchCacheEntryStatus.fresh,
          },
        ],
      ]),
      pushRef: {
        mpaNavigation: false,
        pendingPush: false,
        preserveCustomHistoryState: true,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/linking/about',
      nextUrl: '/linking/about',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>Root layout</body>
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
