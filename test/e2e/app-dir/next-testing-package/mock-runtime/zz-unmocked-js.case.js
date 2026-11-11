import { expect, test } from 'next/experimental/testing/vitest'
import { captured } from '../mock-authoring/subject-js'

test('unmocked JS file observes original exports', () => {
  expect(captured.value).toBe('original')
  expect(captured.retained).toBe(42)
})
