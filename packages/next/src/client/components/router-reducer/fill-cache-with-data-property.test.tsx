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
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      data: null,
      subTreeData: <>Root layout</>,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                subTreeData: <>Linking</>,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          data: null,
                          subTreeData: <>Page</>,
                          parallelRoutes: new Map(),
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
        "data": null,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => {
              "data": null,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => {
                    "data": null,
                    "parallelRoutes": Map {},
                    "subTreeData": <React.Fragment>
                      Page
                    </React.Fragment>,
                  },
                },
              },
              "subTreeData": <React.Fragment>
                Linking
              </React.Fragment>,
            },
            "dashboard" => {
              "data": Promise {},
              "parallelRoutes": Map {},
              "subTreeData": null,
            },
          },
        },
        "subTreeData": null,
      }
    `)
  })
})
