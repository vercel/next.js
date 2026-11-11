import { test, expect } from 'vitest'
import { assertFromHelper } from './helper.mjs'
test('helper shares active assertion count', () => {
  expect.assertions(1)
  assertFromHelper()
})
