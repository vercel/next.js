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
      lazyDataResolved: false,
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      lazyDataResolved: false,
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
                          lazyDataResolved: false,
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
        "lazyDataResolved": false,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => {
              "lazyData": null,
              "lazyDataResolved": false,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => {
                    "lazyData": null,
                    "lazyDataResolved": false,
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
              "lazyDataResolved": false,
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
