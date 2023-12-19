import React from 'react'
import type {
  FlightData,
  FlightRouterState,
} from '../../../server/app-render/types'
import { applyRouterStatePatchToTreeSkipDefault } from './apply-router-state-patch-to-tree'

const getInitialRouterStateTree = (): FlightRouterState => [
  '',
  {
    children: [
      'linking',
      {
        children: ['', {}],
      },
    ],
  },
  undefined,
  undefined,
  true,
]

const getFlightData = (): FlightData => {
  return [
    [
      'children',
      'linking',
      'children',
      'about',
      [
        'about',
        {
          children: ['', {}],
        },
      ],
      ['about', {}, <h1>About Page!</h1>],
      <>
        <title>About page!</title>
      </>,
    ],
  ]
}

describe('applyRouterStatePatchToTree', () => {
  it('should apply a patch to the tree', () => {
    const initialRouterStateTree = getInitialRouterStateTree()
    const flightData = getFlightData()

    if (typeof flightData === 'string') {
      throw new Error('invalid flight data')
    }

    // Mirrors the way router-reducer values are passed in.
    const flightDataPath = flightData[0]
    const [treePatch /*, cacheNodeSeedData, head*/] = flightDataPath.slice(-3)
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const newRouterStateTree = applyRouterStatePatchToTreeSkipDefault(
      ['', ...flightSegmentPath],
      initialRouterStateTree,
      treePatch
    )

    expect(newRouterStateTree).toMatchObject([
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
    ])
  })
})
