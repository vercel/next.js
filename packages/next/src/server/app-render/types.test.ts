import { flightRouterStateSchema } from './types'
import { assert } from 'next/dist/compiled/superstruct'

const validFixtures = [
  [
    ['a', 'b', 'c'],
    {
      a: [['a', 'b', 'c'], {}],
      b: [['a', 'b', 'c'], {}],
    },
  ],
  [
    ['a', 'b', 'c'],
    {
      a: [['a', 'b', 'c'], {}],
      b: [['a', 'b', 'c'], {}],
    },
    null,
    null,
    true,
  ],
  [
    ['a', 'b', 'c'],
    {
      a: [['a', 'b', 'c'], {}],
      b: [['a', 'b', 'c'], {}],
    },
    null,
    'refetch',
  ],
]

const invalidFixtures = [
  // plain wrong
  ['1', 'b', 'c'],
  // invalid enum
  [['a', 'b', 'foo'], {}],
  // invalid url
  [
    ['a', 'b', 'c'],
    {
      a: [['a', 'b', 'c'], {}],
      b: [['a', 'b', 'c'], {}],
    },
    {
      invalid: 'invalid',
    },
  ],
  // invalid isRootLayout
  [
    ['a', 'b', 'c'],
    {
      a: [['a', 'b', 'c'], {}],
      b: [['a', 'b', 'c'], {}],
    },
    null,
    1,
  ],
]

describe('flightRouterStateSchema', () => {
  it('should validate a correct flight router state', () => {
    for (const state of validFixtures) {
      expect(() => assert(state, flightRouterStateSchema)).not.toThrow()
    }
  })
  it('should not validate an incorrect flight router state', () => {
    for (const state of invalidFixtures) {
      expect(() => assert(state, flightRouterStateSchema)).toThrow()
    }
  })
})
