import { test, expect, vi } from 'vitest'
import * as subject from './subject.mjs'
vi.mock('./subject.mjs', () => ({ value: 3, token: {} }))
test('later input generations preserve held earlier namespaces', async () => {
  expect(globalThis.firstSetupGeneration.value).toBe(1)
  expect(globalThis.secondSetupGeneration.value).toBe(2)
  expect(subject.value).toBe(3)
  expect(subject).not.toBe(globalThis.firstSetupGeneration)
  expect(subject).not.toBe(globalThis.secondSetupGeneration)
  expect(globalThis.firstSetupGeneration).not.toBe(
    globalThis.secondSetupGeneration
  )
  expect(subject.token).not.toBe(globalThis.firstSetupGeneration.token)
  expect(subject.token).not.toBe(globalThis.secondSetupGeneration.token)
  expect(await import('./subject.mjs')).toBe(subject)
})
