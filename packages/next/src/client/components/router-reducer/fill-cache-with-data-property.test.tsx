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
      head: null,
      prefetchHead: null,
      parallelRoutes: new Map(),
      lazyDataResolved: false,
      loading: null,
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      lazyDataResolved: false,
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
                lazyDataResolved: false,
                head: null,
                prefetchHead: null,
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
                          head: null,
                          prefetchHead: null,
                          parallelRoutes: new Map(),
                          lazyDataResolved: false,
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
        "head": null,
        "lazyData": null,
        "lazyDataResolved": false,
        "loading": null,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => {
              "head": null,
              "lazyData": null,
              "lazyDataResolved": false,
              "loading": null,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => {
                    "head": null,
                    "lazyData": null,
                    "lazyDataResolved": false,
                    "loading": null,
                    "parallelRoutes": Map {},
                    "prefetchHead": null,
                    "prefetchRsc": null,
                    "rsc": <React.Fragment>
                      Page
                    </React.Fragment>,
                  },
                },
              },
              "prefetchHead": null,
              "prefetchRsc": null,
              "rsc": <React.Fragment>
                Linking
              </React.Fragment>,
            },
            "dashboard" => {
              "head": null,
              "lazyData": Promise {},
              "lazyDataResolved": false,
              "loading": null,
              "parallelRoutes": Map {},
              "prefetchHead": null,
              "prefetchRsc": null,
              "rsc": null,
            },
          },
        },
        "prefetchHead": null,
        "prefetchRsc": null,
        "rsc": null,
      }
    `)
  })
})
