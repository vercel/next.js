import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type {
  FlightData,
  FlightRouterState,
} from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from '../create-initial-router-state'
import { ACTION_SERVER_PATCH, ACTION_NAVIGATE } from '../router-reducer-types'
import type { ServerPatchAction, NavigateAction } from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'
import { serverPatchReducer } from './server-patch-reducer'
const buildId = 'development'

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
    ['somewhere-else', {}, <h1>Somewhere Page!</h1>],
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

describe('serverPatchReducer', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2023-07-26'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

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
    }

    const newState = await serverPatchReducer(state, action)

    expect(newState).toMatchInlineSnapshot(`
      {
        "buildId": "development",
        "cache": {
          "lazyData": null,
          "parallelRoutes": Map {
            "children" => Map {
              "linking" => {
                "lazyData": null,
                "parallelRoutes": Map {
                  "children" => Map {
                    "" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
                    },
                    "somewhere-else" => {
                      "lazyData": null,
                      "parallelRoutes": Map {
                        "children" => Map {
                          "" => {
                            "head": <React.Fragment>
                              <title>
                                Somewhere page!
                              </title>
                            </React.Fragment>,
                            "lazyData": null,
                            "parallelRoutes": Map {},
                            "prefetchRsc": null,
                            "rsc": null,
                          },
                        },
                      },
                      "prefetchRsc": null,
                      "rsc": <h1>
                        Somewhere Page!
                      </h1>,
                    },
                  },
                },
                "prefetchRsc": null,
                "rsc": <React.Fragment>
                  Linking layout level
                </React.Fragment>,
              },
            },
          },
          "prefetchRsc": null,
          "rsc": <html>
            <head />
            <body>
              Root layout
            </body>
          </html>,
        },
        "canonicalUrl": "/linking/about",
        "focusAndScrollRef": {
          "apply": false,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [],
        },
        "nextUrl": "/linking/somewhere-else",
        "prefetchCache": Map {},
        "pushRef": {
          "mpaNavigation": false,
          "pendingPush": false,
          "preserveCustomHistoryState": false,
        },
        "tree": [
          "",
          {
            "children": [
              "linking",
              {
                "children": [
                  "somewhere-else",
                  {
                    "children": [
                      "",
                      {},
                    ],
                  },
                ],
              },
            ],
          },
          ,
          ,
          true,
        ],
      }
    `)
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

    const navigateAction: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: true,
    }

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      isServer: false,
      location: new URL(initialCanonicalUrl, 'https://localhost') as any,
    })

    const stateAfterNavigate = await navigateReducer(state, navigateAction)

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
    }

    const newState = await serverPatchReducer(stateAfterNavigate, action)

    expect(newState).toMatchInlineSnapshot(`
      {
        "buildId": "development",
        "cache": {
          "lazyData": null,
          "parallelRoutes": Map {
            "children" => Map {
              "linking" => {
                "lazyData": null,
                "parallelRoutes": Map {
                  "children" => Map {
                    "" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
                    },
                    "about" => {
                      "lazyData": null,
                      "parallelRoutes": Map {
                        "children" => Map {
                          "" => {
                            "head": <React.Fragment>
                              <title>
                                About page!
                              </title>
                            </React.Fragment>,
                            "lazyData": null,
                            "parallelRoutes": Map {},
                            "prefetchRsc": null,
                            "rsc": null,
                          },
                        },
                      },
                      "prefetchRsc": null,
                      "rsc": <h1>
                        About Page!
                      </h1>,
                    },
                    "somewhere-else" => {
                      "lazyData": null,
                      "parallelRoutes": Map {
                        "children" => Map {
                          "" => {
                            "head": <React.Fragment>
                              <title>
                                Somewhere page!
                              </title>
                            </React.Fragment>,
                            "lazyData": null,
                            "parallelRoutes": Map {},
                            "prefetchRsc": null,
                            "rsc": null,
                          },
                        },
                      },
                      "prefetchRsc": null,
                      "rsc": <h1>
                        Somewhere Page!
                      </h1>,
                    },
                  },
                },
                "prefetchRsc": null,
                "rsc": <React.Fragment>
                  Linking layout level
                </React.Fragment>,
              },
            },
          },
          "prefetchRsc": null,
          "rsc": <html>
            <head />
            <body>
              Root layout
            </body>
          </html>,
        },
        "canonicalUrl": "/linking/about",
        "focusAndScrollRef": {
          "apply": true,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [
            [
              "children",
              "linking",
              "children",
              "about",
              "children",
              "",
            ],
          ],
        },
        "nextUrl": "/linking/somewhere-else",
        "prefetchCache": Map {
          "/linking/about" => {
            "data": Promise {},
            "kind": "temporary",
            "lastUsedTime": 1690329600000,
            "prefetchTime": 1690329600000,
            "treeAtTimeOfPrefetch": [
              "",
              {
                "children": [
                  "linking",
                  {
                    "children": [
                      "about",
                      {
                        "children": [
                          "",
                          {},
                        ],
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
        },
        "pushRef": {
          "mpaNavigation": false,
          "pendingPush": true,
          "preserveCustomHistoryState": false,
        },
        "tree": [
          "",
          {
            "children": [
              "linking",
              {
                "children": [
                  "somewhere-else",
                  {
                    "children": [
                      "",
                      {},
                    ],
                  },
                ],
              },
            ],
          },
          ,
          ,
          true,
        ],
      }
    `)
  })

  it("should gracefully recover if the server patch doesn't match the current tree", async () => {
    const initialTree = getInitialRouterStateTree()
    const initialCanonicalUrl = '/linking'
    const children = (
      <html>
        <head></head>
        <body>Root layout</body>
      </html>
    )

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes: new Map(),
      isServer: false,
      location: new URL('/linking/about', 'https://localhost') as any,
    })

    const action: ServerPatchAction = {
      type: ACTION_SERVER_PATCH,
      // this flight data is intentionally completely unrelated to the existing tree
      flightData: [
        [
          'children',
          'tree-patch-failure',
          'children',
          'new-page',
          ['new-page', { children: ['__PAGE__', {}] }],
          null,
          null,
        ],
      ],
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
    }

    const newState = await serverPatchReducer(state, action)
    expect(newState.pushRef.pendingPush).toBe(true)
    expect(newState.pushRef.mpaNavigation).toBe(true)
    expect(newState.canonicalUrl).toBe('/linking/about')
  })
})
