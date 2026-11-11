import { expect, test, vitest as vi } from 'next/experimental/testing/vitest'
import { captured } from './subject-js'

vi.mock('./dependency-js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, value: 'mocked' }
})

test('public JS static factory mock preserves original exports', () => {
  expect(captured.value).toBe('mocked')
  expect(captured.retained).toBe(42)
})
