import { test, vi } from 'next/experimental/testing/vitest'
import { writeFileSync } from 'node:fs'

const target = '../mock-authoring/dependency-js'
vi.mock(target, () => ({ value: 'mocked', retained: 42 }))

test('nonliteral target must prevent this body', () => {
  writeFileSync('unexpected-nonliteral-body', 'executed')
})
