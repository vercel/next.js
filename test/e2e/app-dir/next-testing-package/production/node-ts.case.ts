import { expect, test } from 'next/experimental/testing/vitest'
import { describeProfile } from './subject'

test('compiled production subject uses production conditions', () => {
  expect(process.env.NODE_ENV).toBe('production')
  expect(describeProfile()).toBe('optimized')
})
