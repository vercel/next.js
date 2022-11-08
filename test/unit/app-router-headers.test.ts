import { escapeFlightRouterState } from 'next/client/components/app-router-headers'
import { FlightRouterState } from 'next/server/app-render'

const state1: FlightRouterState = [
  '',
  {
    children: [
      ['slug', 'свитер-urbain', 'd'],
      {
        children: ['', {}],
      },
    ],
  },
  null,
  'refetch',
]
const state1Escaped: FlightRouterState = [
  '',
  {
    children: [
      ['slug', '%D1%81%D0%B2%D0%B8%D1%82%D0%B5%D1%80-urbain', 'd'],
      {
        children: ['', {}],
      },
    ],
  },
  null,
  'refetch',
]

const state2: FlightRouterState = [
  '',
  {
    children: [
      ['slug', 'свитер-urbain', 'd'],
      {
        children: ['', {}],
      },
    ],
  },
  null,
  null,
  true,
]
const state2Escaped: FlightRouterState = [
  '',
  {
    children: [
      ['slug', '%D1%81%D0%B2%D0%B8%D1%82%D0%B5%D1%80-urbain', 'd'],
      {
        children: ['', {}],
      },
    ],
  },
  null,
  null,
  true,
]

const state3: FlightRouterState = [
  '',
  {
    children: [
      ['slug', 'свитер-urbain', 'd'],
      {
        children: ['', {}],
      },
      null,
      'refetch',
    ],
  },
]
const state3Escaped: FlightRouterState = [
  '',
  {
    children: [
      ['slug', '%D1%81%D0%B2%D0%B8%D1%82%D0%B5%D1%80-urbain', 'd'],
      {
        children: ['', {}],
      },
      null,
      'refetch',
    ],
  },
]

describe('escapeFlightRouterState', () => {
  it.each([
    { state: state1, escapedState: state1Escaped },
    { state: state2, escapedState: state2Escaped },
    { state: state3, escapedState: state3Escaped },
  ])('should escape non-iso segment value', ({ state, escapedState }) => {
    expect(escapeFlightRouterState(state)).toMatchObject(escapedState)
  })
})
