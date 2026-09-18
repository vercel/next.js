import { expect, test, vi } from 'next/experimental/testing/vitest'
import { captured } from './subject-ts'

vi.mock(import('./dependency-ts'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, value: 'mocked' }
})

test('public TS static factory mock preserves original exports', () => {
  expect(captured.value).toBe('mocked')
  expect(captured.retained).toBe(42)
})
