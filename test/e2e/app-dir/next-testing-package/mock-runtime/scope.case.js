import { expect, test, vi } from 'next/experimental/testing/vitest'
import { writeFileSync } from 'node:fs'
import { captured } from '../mock-authoring/subject-js'

vi.mock('../mock-authoring/dependency-js', () => ({
  value: 'mocked',
  retained: 42,
}))

test('unsupported profile must prevent this body', () => {
  writeFileSync('unexpected-scope-body', 'executed')
  expect(captured.value).toBe('mocked')
})
