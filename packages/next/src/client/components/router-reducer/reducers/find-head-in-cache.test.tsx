import React from 'react'
import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { findHeadInCache } from './find-head-in-cache'

describe('findHeadInCache', () => {
  it('should find the head', () => {
    const routerTree: FlightRouterState = [
      '',
      {
        children: [
          'linking',
          {
            children: [
              'about',
              {
                children: ['', {}],
              },
            ],
          },
        ],
      },
      undefined,
      undefined,
      true,
    ]

    const cache: CacheNode = {
      lazyData: null,
      subTreeData: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                lazyData: null,
                subTreeData: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        'about',
                        {
                          lazyData: null,
                          parallelRoutes: new Map([
                            [
                              'children',
                              new Map([
                                [
                                  '',
                                  {
                                    lazyData: null,
                                    subTreeData: null,
                                    parallelRoutes: new Map(),
                                    head: (
                                      <>
                                        <title>About page!</title>
                                      </>
                                    ),
                                  },
                                ],
                              ]),
                            ],
                          ]),
                          subTreeData: null,
                        },
                      ],
                      // TODO-APP: this segment should be preserved when creating the new cache
                      // [
                      //   '',
                      //   {
                      //     lazyData: null,
                      //     subTreeData: <>Page</>,
                      //     parallelRoutes: new Map(),
                      //   },
                      // ],
                    ]),
                  ],
                ]),
              },
            ],
          ]),
        ],
      ]),
    }

    const result = findHeadInCache(cache, routerTree[1])

    expect(result).toMatchObject(
      <>
        <title>About page!</title>
      </>
    )
  })
})
