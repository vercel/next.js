import React from 'react'
import type {
  FlightData,
  FlightRouterState,
} from '../../../server/app-render/types'
import { shouldHardNavigate } from './should-hard-navigate'

describe('shouldHardNavigate', () => {
  it('should return false if the segments match', () => {
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
    const initialRouterStateTree = getInitialRouterStateTree()
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
    const flightData = getFlightData()

    if (typeof flightData === 'string') {
      throw new Error('invalid flight data')
    }

    // Mirrors the way router-reducer values are passed in.
    const flightDataPath = flightData[0]
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const result = shouldHardNavigate(
      ['', ...flightSegmentPath],
      initialRouterStateTree
    )

    expect(result).toBe(false)
  })

  it('should return false if segments are dynamic and match', () => {
    const getInitialRouterStateTree = (): FlightRouterState => [
      '',
      {
        children: [
          'link-hard-push',
          {
            children: [
              ['id', '123', 'd'],
              {
                children: ['', {}],
              },
            ],
          },
        ],
      },
      null,
      null,
      true,
    ]
    const initialRouterStateTree = getInitialRouterStateTree()
    const getFlightData = (): FlightData => {
      return [
        [
          'children',
          'link-hard-push',
          'children',
          ['id', '123', 'd'],
          [
            ['id', '123', 'd'],
            {
              children: ['', {}],
            },
          ],
          [['id', '123', 'd'], {}, null],
          null,
        ],
      ]
    }
    const flightData = getFlightData()

    if (typeof flightData === 'string') {
      throw new Error('invalid flight data')
    }

    // Mirrors the way router-reducer values are passed in.
    const flightDataPath = flightData[0]
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const result = shouldHardNavigate(
      ['', ...flightSegmentPath],
      initialRouterStateTree
    )

    expect(result).toBe(false)
  })

  it('should return true if segments are dynamic and mismatch', () => {
    const getInitialRouterStateTree = (): FlightRouterState => [
      '',
      {
        children: [
          'link-hard-push',
          {
            children: [
              ['id', '456', 'd'],
              {
                children: ['', {}],
              },
            ],
          },
        ],
      },
      null,
      null,
      true,
    ]
    const initialRouterStateTree = getInitialRouterStateTree()
    const getFlightData = (): FlightData => {
      return [
        [
          'children',
          'link-hard-push',
          'children',
          ['id', '123', 'd'],
          [
            ['id', '123', 'd'],
            {
              children: ['', {}],
            },
          ],
          [['id', '123', 'd'], {}, null],
          null,
          false,
        ],
      ]
    }
    const flightData = getFlightData()

    if (typeof flightData === 'string') {
      throw new Error('invalid flight data')
    }

    // Mirrors the way router-reducer values are passed in.
    const flightDataPath = flightData[0]
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const result = shouldHardNavigate(
      ['', ...flightSegmentPath],
      initialRouterStateTree
    )

    expect(result).toBe(true)
  })
})
