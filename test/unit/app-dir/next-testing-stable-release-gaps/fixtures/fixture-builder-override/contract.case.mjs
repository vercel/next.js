import { test, expect, describe } from 'vitest'
const owned = test.extend('value', () => 1)
describe('override', () => {
  owned.override('value', () => 2)
  owned('overridden builder', ({ value }) => expect(value).toBe(2))
})
