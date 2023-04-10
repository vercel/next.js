import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render/types'
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
import { FlightRouterState } from '../../../../server/app-render/types'
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import { createInitialRouterState } from '../create-initial-router-state'
import { PrefetchAction, ACTION_PREFETCH } from '../router-reducer-types'
import { prefetchReducer } from './prefetch-reducer'
import { fetchServerResponse } from '../fetch-server-response'
import { createRecordFromThenable } from '../create-record-from-thenable'

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

    const url = new URL('/linking/about', 'https://localhost')
    const serverResponse = await fetchServerResponse(
      url,
      initialTree,
      null,
      true
    )
    const action: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
    }

    const newState = await runPromiseThrowChain(() =>
      prefetchReducer(state, action)
    )

    const prom = Promise.resolve(serverResponse)
    const record = createRecordFromThenable(prom)
    await prom

    const expectedState: ReturnType<typeof prefetchReducer> = {
      prefetchCache: new Map([
        [
          '/linking/about',
          {
            data: record,
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
      },
      focusAndScrollRef: {
        apply: false,
        hashFragment: null,
      },
      canonicalUrl: '/linking',
      cache: {
        status: CacheStates.READY,
        data: null,
        subTreeData: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
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

    const url = new URL('/linking/about', 'https://localhost')
    const serverResponse = await fetchServerResponse(
      url,
      initialTree,
      null,
      true
    )
    const action: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
    }

    await runPromiseThrowChain(() => prefetchReducer(state, action))

    const newState = await runPromiseThrowChain(() =>
      prefetchReducer(state2, action)
    )

    const prom = Promise.resolve(serverResponse)
    const record = createRecordFromThenable(prom)
    await prom

    const expectedState: ReturnType<typeof prefetchReducer> = {
      prefetchCache: new Map([
        [
          '/linking/about',
          {
            data: record,
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
      },
      focusAndScrollRef: {
        apply: false,
        hashFragment: null,
      },
      canonicalUrl: '/linking',
      cache: {
        status: CacheStates.READY,
        data: null,
        subTreeData: (
          <html>
            <head></head>
            <body>Root layout</body>
          </html>
        ),
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
