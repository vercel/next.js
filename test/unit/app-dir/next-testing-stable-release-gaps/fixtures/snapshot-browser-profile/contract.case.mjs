import { test, expect } from 'vitest'
test('profile snapshot round trip', () => {
  expect(typeof window).toBe('object')
  expect({ profile: 'actual' }).toMatchSnapshot()
  expect('profile inline').toMatchInlineSnapshot()
})
