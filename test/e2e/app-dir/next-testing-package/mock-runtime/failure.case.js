import { expect, test, vi } from 'next/experimental/testing/vitest'
import { writeFileSync } from 'node:fs'
import { captured } from '../mock-authoring/subject-js'

vi.mock('../mock-authoring/dependency-js', async () => {
  throw new Error('P2_PUBLIC_MOCK_FACTORY_FAILURE')
})

test('factory failure must prevent this body', () => {
  writeFileSync('unexpected-failure-body', 'executed')
  expect(captured.value).toBe('mocked')
})
