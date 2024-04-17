import React from 'react'
import { clearCacheNodeDataForSegmentPath } from './clear-cache-node-data-for-segment-path'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'

describe('clearCacheNodeDataForSegmentPath', () => {
  it('should clear the data property', () => {
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
      error: null,
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      lazyDataResolved: false,
      loading: null,
      error: null,
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
                error: null,
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
                          error: null,
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

    clearCacheNodeDataForSegmentPath(cache, existingCache, flightSegmentPath)

    expect(cache).toMatchInlineSnapshot(`
      {
        "error": null,
        "head": null,
        "lazyData": null,
        "lazyDataResolved": false,
        "loading": null,
        "parallelRoutes": Map {
          "children" => Map {
            "linking" => {
              "error": null,
              "head": null,
              "lazyData": null,
              "lazyDataResolved": false,
              "loading": null,
              "parallelRoutes": Map {
                "children" => Map {
                  "" => {
                    "error": null,
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
              "error": null,
              "head": null,
              "lazyData": null,
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
