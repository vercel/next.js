import React from 'react'
import type { FetchServerResponseResult } from './fetch-server-response'
import { fillCacheWithDataProperty } from './fill-cache-with-data-property'
import { CacheStates } from '../../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import { createRecordFromThenable } from './create-record-from-thenable'
import type { ThenableRecord } from './router-reducer-types'
describe('fillCacheWithDataProperty', () => {
  it('should add data property', () => {
    const fetchServerResponseMock: jest.Mock<
      ThenableRecord<FetchServerResponseResult>
    > = jest.fn(() =>
      createRecordFromThenable(
        Promise.resolve([
          /* TODO-APP: replace with actual FlightData */ '',
          undefined,
        ])
      )
    )
    const pathname = '/dashboard/settings'
    const segments = pathname.split('/')

    const flightSegmentPath = segments
      .slice(1)
      .map((segment) => ['children', segment])
      .flat()

    const cache: CacheNode = {
      status: CacheStates.LAZY_INITIALIZED,
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    const existingCache: CacheNode = {
      data: null,
      status: CacheStates.READY,
      subTreeData: <>Root layout</>,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                status: CacheStates.READY,
                subTreeData: <>Linking</>,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        '',
                        {
                          data: null,
                          status: CacheStates.READY,
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
      Object {
        "data": null,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => Object {
              "data": null,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => Object {
                    "data": null,
                    "parallelRoutes": Map {},
                    "status": "READY",
                    "subTreeData": <React.Fragment>
                      Page
                    </React.Fragment>,
                  },
                },
              },
              "status": "READY",
              "subTreeData": <React.Fragment>
                Linking
              </React.Fragment>,
            },
            "dashboard" => Object {
              "data": Promise {
                "status": "pending",
              },
              "parallelRoutes": Map {},
              "status": "DATAFETCH",
              "subTreeData": null,
            },
          },
        },
        "status": "LAZYINITIALIZED",
        "subTreeData": null,
      }
    `)
  })
})
