import { flightRouterStateSchema } from './types'
import { assert } from 'next/dist/compiled/superstruct'

const validFixtures = [
  [
    ['a', 'b', 'c', null],
    {
      a: [['a', 'b', 'c', null], {}],
      b: [['a', 'b', 'c', null], {}],
    },
  ],
  [
    ['a', 'b', 'c', ['sibling1', 'sibling2']],
    {
      a: [['a', 'b', 'c', null], {}],
      b: [['a', 'b', 'c', []], {}],
    },
    null,
    null,
    true,
  ],
  [
    ['a', 'b', 'c', null],
    {
      a: [['a', 'b', 'c', null], {}],
      b: [['a', 'b', 'c', null], {}],
    },
    null,
    'refetch',
  ],
]

const invalidFixtures = [
  // plain wrong
  ['1', 'b', 'c'],
  // invalid enum (missing 4th element)
  [['a', 'b', 'foo'], {}],
  // invalid enum (with 4th element)
  [['a', 'b', 'foo', null], {}],
  // invalid staticSiblings (not an array)
  [['a', 'b', 'c', 'not-an-array'], {}],
  // invalid staticSiblings (array with non-strings)
  [['a', 'b', 'c', [1, 2]], {}],
  // invalid url
  [
    ['a', 'b', 'c', null],
    {
      a: [['a', 'b', 'c', null], {}],
      b: [['a', 'b', 'c', null], {}],
    },
    {
      invalid: 'invalid',
    },
  ],
  // invalid isRootLayout
  [
    ['a', 'b', 'c', null],
    {
      a: [['a', 'b', 'c', null], {}],
      b: [['a', 'b', 'c', null], {}],
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
