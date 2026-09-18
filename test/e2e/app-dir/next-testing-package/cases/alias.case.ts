/// <reference types="next/experimental/testing/vitest-global" />
import { expect, test } from 'vitest'

test('bare compatibility import uses Next', () => {
  expect('Next').toMatch(/^Next$/)
})
