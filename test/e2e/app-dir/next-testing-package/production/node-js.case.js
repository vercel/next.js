import { expect, test } from 'next/experimental/testing/vitest'
import { describeProfile } from './subject'

test('JavaScript production authoring uses the installed runner', () => {
  expect(process.env.NODE_ENV).toBe('production')
  expect(describeProfile()).toBe('optimized')
})
