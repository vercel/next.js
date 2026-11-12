import { expect, test } from 'next/experimental/testing/vitest'
import { price, unusedPrice } from './price'
import { label, unusedLabel } from './label'

test('covers the regular price in the first worker', () => {
  expect(typeof unusedPrice).toBe('function')
  expect(typeof unusedLabel).toBe('function')
  expect(label(price(2))).toBe('Total: 20')
})
