import React from 'react'
import type { FetchServerResponseResult } from './fetch-server-response'
import { fillCacheWithDataProperty } from './fill-cache-with-data-property'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'

describe('fillCacheWithDataProperty', () => {
  it('should add data property', () => {
    const fetchServerResponseMock: jest.Mock<
      Promise<FetchServerResponseResult>
    > = jest.fn(() =>
      Promise.resolve([
        /* TODO-APP: replace with actual FlightData */ '',
        undefined,
      ])
    )
    const pathname = '/dashboard/settings'
    const segments = pathname.split('/')

    const flightSegmentPath = segments
      .slice(1)
      .map((segment) => ['children', segment])
      .flat()

    const cache: CacheNode = {
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      parallelRoutes: new Map(),
      loading: null,
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      loading: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                rsc: <>Linking</>,
                prefetchRsc: null,
                loading: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          lazyData: null,
                          rsc: <>Page</>,
                          prefetchRsc: null,
                          parallelRoutes: new Map(),
                          loading: null,
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
    }

    fillCacheWithDataProperty(cache, existingCache, flightSegmentPath, () =>
      fetchServerResponseMock()
    )

    expect(cache).toMatchInlineSnapshot(`
      {
        "lazyData": null,
        "loading": null,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => {
              "lazyData": null,
              "loading": null,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => {
                    "lazyData": null,
                    "loading": null,
                    "parallelRoutes": Map {},
                    "prefetchRsc": null,
                    "rsc": <React.Fragment>
                      Page
                    </React.Fragment>,
                  },
                },
              },
              "prefetchRsc": null,
              "rsc": <React.Fragment>
                Linking
              </React.Fragment>,
            },
            "dashboard" => {
              "lazyData": Promise {},
              "loading": null,
              "parallelRoutes": Map {},
              "prefetchRsc": null,
              "rsc": null,
            },
          },
        },
        "prefetchRsc": null,
        "rsc": null,
      }
    `)
  })
})
