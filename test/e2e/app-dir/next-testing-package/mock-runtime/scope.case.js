import { expect, test, vi } from 'next/experimental/testing/vitest'
import { writeFileSync } from 'node:fs'
import { captured } from '../mock-authoring/subject-js'

vi.mock('../mock-authoring/dependency-js', () => ({
  value: 'mocked',
  retained: 42,
}))

test('setup observes the original graph before the mocked spec', () => {
  if (!globalThis.__nextPackedMockSetup) {
    writeFileSync('unexpected-scope-body', 'executed')
  }
  expect(globalThis.__nextPackedMockSetup).toEqual({ value: 'original' })
  expect(captured.value).toBe('mocked')
})
