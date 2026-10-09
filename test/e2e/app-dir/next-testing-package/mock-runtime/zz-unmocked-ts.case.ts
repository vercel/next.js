import { expect, test } from 'next/experimental/testing/vitest'
import { captured } from '../mock-authoring/subject-ts'

test('unmocked TS file observes original exports', () => {
  expect(captured.value).toBe('original')
  expect(captured.retained).toBe(42)
})
