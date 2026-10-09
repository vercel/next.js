import { expect, test } from 'next/experimental/testing/vitest'
import { price } from './price'
import { label } from './label'

let attempt = 0
test('merges coverage from a retry and a second worker', { retry: 1 }, () => {
  attempt++
  expect(label(price(attempt === 1 ? 10 : 2))).toBe(
    attempt === 1 ? 'Total: 80' : 'Total: 20'
  )
  expect(attempt).toBe(2)
})
