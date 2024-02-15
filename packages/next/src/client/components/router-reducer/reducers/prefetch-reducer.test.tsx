import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render/types'
import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from '../create-initial-router-state'
import {
  ACTION_PREFETCH,
  PrefetchCacheEntryStatus,
  PrefetchKind,
} from '../router-reducer-types'
import type {
  PrefetchAction,
  PrefetchCacheEntry,
} from '../router-reducer-types'
import { prefetchReducer } from './prefetch-reducer'
import { fetchServerResponse } from '../fetch-server-response'

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
      ['about', {}, <h1>About Page!</h1>],
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

describe('prefetchReducer', () => {
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
      buildId: 'development',
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const url = new URL('/linking/about', 'https://localhost')
    const serverResponse = await fetchServerResponse(
      url,
      initialTree,
      null,
      state.buildId,
      PrefetchKind.AUTO
    )
    const action: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
      kind: PrefetchKind.AUTO,
    }

    const newState = await runPromiseThrowChain(() =>
      prefetchReducer(state, action)
    )

    const prom = Promise.resolve(serverResponse)
    await prom

    const expectedState: ReturnType<typeof prefetchReducer> = {
      buildId: 'development',
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
        [
          '/linking/about',
          {
            key: '/linking/about',
            data: prom,
            kind: PrefetchKind.AUTO,
            lastUsedTime: null,
            prefetchTime: expect.any(Number),
            status: PrefetchCacheEntryStatus.fresh,
            treeAtTimeOfPrefetch: [
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
      canonicalUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
        prefetchRsc: null,
        parallelRoutes: initialParallelRoutes,
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
      nextUrl: '/linking',
    }

    expect(newState).toMatchObject(expectedState)
  })

  it('should apply navigation (concurrent)', async () => {
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
      buildId: 'development',
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const state2 = createInitialRouterState({
      buildId: 'development',
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      location: new URL('/linking', 'https://localhost') as any,
    })

    const url = new URL('/linking/about', 'https://localhost')
    const serverResponse = await fetchServerResponse(
      url,
      initialTree,
      null,
      state.buildId,
      PrefetchKind.AUTO
    )
    const action: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
      kind: PrefetchKind.AUTO,
    }

    await runPromiseThrowChain(() => prefetchReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      prefetchReducer(state2, action)
    )

    const prom = Promise.resolve(serverResponse)
    await prom

    const prefetchCache = new Map<string, PrefetchCacheEntry>()
    prefetchCache.set('/linking', {
      data: expect.any(Promise),
      kind: PrefetchKind.AUTO,
      lastUsedTime: null,
      prefetchTime: expect.any(Number),
      treeAtTimeOfPrefetch: initialTree,
      key: '/linking',
      status: PrefetchCacheEntryStatus.fresh,
    })

    const expectedState: ReturnType<typeof prefetchReducer> = {
      buildId: 'development',
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
        [
          '/linking/about',
          {
            key: '/linking/about',
            data: prom,
            prefetchTime: expect.any(Number),
            kind: PrefetchKind.AUTO,
            lastUsedTime: null,
            status: PrefetchCacheEntryStatus.fresh,
            treeAtTimeOfPrefetch: [
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
      canonicalUrl: '/linking',
      cache: {
        lazyData: null,
        rsc: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
        prefetchRsc: null,
        parallelRoutes: initialParallelRoutes,
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
      nextUrl: '/linking',
    }

    expect(newState).toMatchObject(expectedState)
  })
})
