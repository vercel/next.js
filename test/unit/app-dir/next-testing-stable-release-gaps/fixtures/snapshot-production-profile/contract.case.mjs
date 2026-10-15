import { test, expect } from 'vitest'
test('profile snapshot round trip', () => {
  expect({ profile: 'actual' }).toMatchSnapshot()
  expect('profile inline').toMatchInlineSnapshot()
})
