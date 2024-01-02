import React from 'react'
import type { fetchServerResponse as fetchServerResponseType } from '../fetch-server-response'
import type { FlightData } from '../../../../server/app-render/types'
import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createInitialRouterState } from '../create-initial-router-state'
import {
  ACTION_NAVIGATE,
  ACTION_PREFETCH,
  PrefetchKind,
} from '../router-reducer-types'
import type { NavigateAction, PrefetchAction } from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'
import { prefetchReducer } from './prefetch-reducer'
import { handleMutable } from '../handle-mutable'

const buildId = 'development'

const flightData: FlightData = [
  [
    'children',
    'linking',
    'children',
    'about',
    [
      'about',
      {
        children: ['__PAGE__', {}],
      },
    ],
    ['about', {}, <h1>About Page!</h1>],
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
                children: ['__PAGE__', {}],
              },
            ],
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
        <body>Root layout from response</body>
      </html>,
    ],
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
      if (url.pathname === '/linking' && url.hash === '#hash') {
        return Promise.resolve(['', undefined])
      }
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

const getInitialRouterStateTree = (): FlightRouterState => [
  '',
  {
    children: [
      'linking',
      {
        children: ['__PAGE__', {}],
      },
    ],
  },
  undefined,
  undefined,
  true,
]

describe('navigateReducer', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2023-07-26'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

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
                      '__PAGE__',
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
      location: new URL('/linking', 'https://localhost') as any,
    })
    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
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
                          "__PAGE__" => {
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
              "__PAGE__",
            ],
          ],
        },
        "nextUrl": "/linking/about",
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
                      "__PAGE__",
                      {},
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
                  "about",
                  {
                    "children": [
                      "__PAGE__",
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '__PAGE__',
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
      location: new URL('/linking', 'https://localhost') as any,
    })

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
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
                          "__PAGE__" => {
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
              "__PAGE__",
            ],
          ],
        },
        "nextUrl": "/linking/about",
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
                      "__PAGE__",
                      {},
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
                  "about",
                  {
                    "children": [
                      "__PAGE__",
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '__PAGE__',
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
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
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
        "canonicalUrl": "https://example.vercel.sh/",
        "focusAndScrollRef": {
          "apply": false,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [],
        },
        "nextUrl": "/linking",
        "prefetchCache": Map {},
        "pushRef": {
          "mpaNavigation": true,
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
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ],
      }
    `)
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '__PAGE__',
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
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
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
        "canonicalUrl": "https://example.vercel.sh/",
        "focusAndScrollRef": {
          "apply": false,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [],
        },
        "nextUrl": "/linking",
        "prefetchCache": Map {},
        "pushRef": {
          "mpaNavigation": true,
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
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ],
      }
    `)
  })

  it('should apply navigation for scroll', async () => {
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
                      '__PAGE__',
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
      location: new URL('/linking#hash', 'https://localhost') as any,
    })

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking#hash', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: false, // should not scroll
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
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
        "canonicalUrl": "",
        "focusAndScrollRef": {
          "apply": false,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [],
        },
        "nextUrl": "/linking",
        "prefetchCache": Map {
          "/linking" => {
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
                      "__PAGE__",
                      {},
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
          "mpaNavigation": true,
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
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ],
      }
    `)
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
              parallelRoutes: new Map([
                [
                  'children',
                  new Map([
                    [
                      '__PAGE__',
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

    const url = new URL('/linking/about', 'https://localhost')
    const prefetchAction: PrefetchAction = {
      type: ACTION_PREFETCH,
      url,
      kind: PrefetchKind.AUTO,
    }

    const state = createInitialRouterState({
      buildId,
      initialTree,
      initialHead: null,
      initialCanonicalUrl,
      initialSeedData: ['', {}, children],
      initialParallelRoutes,
      isServer: false,
      location: new URL('/linking', 'https://localhost') as any,
    })

    await prefetchReducer(state, prefetchAction)

    await state.prefetchCache.get(url.pathname + url.search)?.data

    await prefetchReducer(state, prefetchAction)
    await state.prefetchCache.get(url.pathname + url.search)?.data

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about', 'https://localhost'),
      isExternalUrl: false,
      navigateType: 'push',
      locationSearch: '',
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

    const prom = Promise.resolve([
      [
        [
          'children',
          'linking',
          'children',
          'about',
          [
            'about',
            {
              children: ['__PAGE__', {}],
            },
          ],
          <h1>About Page!</h1>,
          <React.Fragment>
            <title>About page!</title>
          </React.Fragment>,
        ],
      ],
      undefined,
    ] as any)
    await prom

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
                    "__PAGE__" => {
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
                          "__PAGE__" => {
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
              "__PAGE__",
            ],
          ],
        },
        "nextUrl": "/linking/about",
        "prefetchCache": Map {
          "/linking/about" => {
            "data": Promise {},
            "kind": "auto",
            "lastUsedTime": 1690329600000,
            "prefetchTime": 1690329600000,
            "treeAtTimeOfPrefetch": [
              "",
              {
                "children": [
                  "linking",
                  {
                    "children": [
                      "__PAGE__",
                      {},
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
                  "about",
                  {
                    "children": [
                      "__PAGE__",
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

  it('should apply parallel routes navigation (concurrent)', async () => {
    const initialTree: FlightRouterState = [
      '',
      {
        children: [
          'parallel-tab-bar',
          {
            audience: ['__PAGE__', {}],
            views: ['__PAGE__', {}],
            children: ['__PAGE__', {}],
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
              parallelRoutes: new Map([
                [
                  'audience',
                  new Map([
                    [
                      '__PAGE__',
                      {
                        lazyData: null,
                        rsc: <>Audience Page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
                [
                  'views',
                  new Map([
                    [
                      '__PAGE__',
                      {
                        lazyData: null,
                        rsc: <>Views Page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
                [
                  'children',
                  new Map([
                    [
                      '__PAGE__',
                      {
                        lazyData: null,
                        rsc: <>Children Page</>,
                        prefetchRsc: null,
                        parallelRoutes: new Map(),
                      },
                    ],
                  ]),
                ],
              ]),
              lazyData: null,
              rsc: <>Layout level</>,
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
      location: new URL('/parallel-tab-bar', 'https://localhost') as any,
    })

    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/parallel-tab-bar/demographics', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

    expect(newState).toMatchInlineSnapshot(`
      {
        "buildId": "development",
        "cache": {
          "lazyData": null,
          "parallelRoutes": Map {
            "children" => Map {
              "parallel-tab-bar" => {
                "lazyData": null,
                "parallelRoutes": Map {
                  "audience" => Map {
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Audience Page
                      </React.Fragment>,
                    },
                    "demographics" => {
                      "lazyData": null,
                      "parallelRoutes": Map {
                        "children" => Map {
                          "__PAGE__" => {
                            "head": <React.Fragment>
                              <title>
                                Demographics Head
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
                      "rsc": null,
                    },
                  },
                  "views" => Map {
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Views Page
                      </React.Fragment>,
                    },
                  },
                  "children" => Map {
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Children Page
                      </React.Fragment>,
                    },
                  },
                },
                "prefetchRsc": null,
                "rsc": null,
              },
            },
          },
          "prefetchRsc": null,
          "rsc": <html>
            <head />
            <body>
              Root layout from response
            </body>
          </html>,
        },
        "canonicalUrl": "/parallel-tab-bar/demographics",
        "focusAndScrollRef": {
          "apply": true,
          "hashFragment": null,
          "onlyHashChange": false,
          "segmentPaths": [
            [
              "children",
              "parallel-tab-bar",
              "audience",
              "demographics",
              "children",
              "__PAGE__",
            ],
          ],
        },
        "nextUrl": "/parallel-tab-bar/demographics",
        "prefetchCache": Map {
          "/parallel-tab-bar/demographics" => {
            "data": Promise {},
            "kind": "temporary",
            "lastUsedTime": 1690329600000,
            "prefetchTime": 1690329600000,
            "treeAtTimeOfPrefetch": [
              "",
              {
                "children": [
                  "parallel-tab-bar",
                  {
                    "audience": [
                      "__PAGE__",
                      {},
                    ],
                    "children": [
                      "__PAGE__",
                      {},
                    ],
                    "views": [
                      "__PAGE__",
                      {},
                    ],
                  },
                ],
              },
              null,
              null,
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
              "parallel-tab-bar",
              {
                "audience": [
                  "demographics",
                  {
                    "children": [
                      "__PAGE__",
                      {},
                    ],
                  },
                ],
                "children": [
                  "__PAGE__",
                  {},
                ],
                "views": [
                  "__PAGE__",
                  {},
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

  it('should apply navigation for hash fragments within the same tree', async () => {
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
                      '__PAGE__',
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
      location: new URL('/linking#hash', 'https://localhost') as any,
    })

    const mutable = {
      canonicalUrl: '/linking#hash',
      previousTree: initialTree,
      hashFragment: '#hash',
      pendingPush: true,
      shouldScroll: true,
      preserveCustomHistoryState: false,
    }

    const newState = handleMutable(state, mutable)

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
                    "__PAGE__" => {
                      "lazyData": null,
                      "parallelRoutes": Map {},
                      "prefetchRsc": null,
                      "rsc": <React.Fragment>
                        Linking page
                      </React.Fragment>,
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
        "canonicalUrl": "/linking#hash",
        "focusAndScrollRef": {
          "apply": false,
          "hashFragment": "hash",
          "onlyHashChange": true,
          "segmentPaths": [],
        },
        "nextUrl": "/linking",
        "prefetchCache": Map {},
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
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ],
      }
    `)
  })

  it('should apply navigation for hash fragments within a different tree', async () => {
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
                      '__PAGE__',
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
      location: new URL('/linking', 'https://localhost') as any,
    })
    const action: NavigateAction = {
      type: ACTION_NAVIGATE,
      url: new URL('/linking/about#hash', 'https://localhost'),
      isExternalUrl: false,
      locationSearch: '',
      navigateType: 'push',
      shouldScroll: true,
    }

    const newState = await navigateReducer(state, action)

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
                    "__PAGE__" => {
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
                          "__PAGE__" => {
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
        "canonicalUrl": "/linking/about#hash",
        "focusAndScrollRef": {
          "apply": true,
          "hashFragment": "hash",
          "onlyHashChange": false,
          "segmentPaths": [
            [
              "children",
              "linking",
              "children",
              "about",
              "children",
              "__PAGE__",
            ],
          ],
        },
        "nextUrl": "/linking/about",
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
                      "__PAGE__",
                      {},
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
                  "about",
                  {
                    "children": [
                      "__PAGE__",
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
})
