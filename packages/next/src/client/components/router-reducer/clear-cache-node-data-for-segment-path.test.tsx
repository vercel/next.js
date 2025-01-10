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
      loading: null,
    }
    const existingCache: CacheNode = {
      lazyData: null,
      rsc: <>Root layout</>,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
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

    clearCacheNodeDataForSegmentPath(cache, existingCache, flightSegmentPath)

    expect(cache).toMatchInlineSnapshot(`
     {
       "head": null,
       "lazyData": null,
       "loading": null,
       "parallelRoutes": Map {
         "children" => Map {
           "linking" => {
             "head": null,
             "lazyData": null,
             "loading": null,
             "parallelRoutes": Map {
               "children" => Map {
                 "" => {
                   "head": null,
                   "lazyData": null,
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
             "lazyData": null,
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
