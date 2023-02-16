import React from 'react'
import { FlightRouterState } from '../../../../server/app-render'
import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
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
      data: null,
      status: CacheStates.LAZY_INITIALIZED,
      subTreeData: null,
      parallelRoutes: new Map([
        [
          'children',
          new Map([
            [
              'linking',
              {
                data: null,
                status: CacheStates.LAZY_INITIALIZED,
                subTreeData: null,
                parallelRoutes: new Map([
                  [
                    'children',
                    new Map([
                      [
                        'about',
                        {
                          data: null,
                          parallelRoutes: new Map([
                            [
                              'children',
                              new Map([
                                [
                                  '',
                                  {
                                    data: null,
                                    status: CacheStates.LAZY_INITIALIZED,
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
                          status: CacheStates.LAZY_INITIALIZED,
                        },
                      ],
                      // TODO-APP: this segment should be preserved when creating the new cache
                      // [
                      //   '',
                      //   {
                      //     data: null,
                      //     status: CacheStates.READY,
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

    const result = findHeadInCache(
      cache.parallelRoutes.get('children')!,
      routerTree[1]
    )

    expect(result).toMatchObject(
      <>
        <title>About page!</title>
      </>
    )
  })
})
