import { test, expect } from 'vitest'
import * as subject from './subject.mjs'
import * as counter from './counter.mjs'
test('setup and spec retain one generation and one live dependency', async () => {
  expect(globalThis.firstSetupInput.subject).toBe(subject)
  expect(globalThis.secondSetupInput.subject).toBe(subject)
  expect(await import('./subject.mjs')).toBe(subject)
  expect(subject.value).toBe(41)
  expect(globalThis.firstSetupInput.subject.token).toBe(subject.token)
  expect(globalThis.firstSetupInput.counter).toBe(counter)
  expect(globalThis.secondSetupInput.counter).toBe(counter)
  expect(globalThis.setupDependencyEvaluations).toBe(1)
  expect(counter.count).toBe(2)
  counter.increment()
  expect(globalThis.firstSetupInput.counter.count).toBe(3)
  expect(globalThis.secondSetupInput.counter.count).toBe(3)
})
