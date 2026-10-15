/* eslint-disable no-empty-pattern -- Fixture dependencies use object destructuring. */
import { test, expect } from 'vitest'
const owned = test.extend({
  value: async ({}, lease) => {
    await lease(42)
    throw new Error('release fixture teardown failure')
  },
})
owned('passed body retains failed teardown', ({ value }) =>
  expect(value).toBe(42)
)
test('successor is retained', () => expect(1).toBe(1))
