import { beforeAll, afterAll, expect } from 'vitest'
import { setup, teardown } from './subject'

if (globalThis.__stage3WorkerLoaded) throw new Error('File realm was reused')
globalThis.__stage3WorkerLoaded = true
console.log('STAGE3_WORKER_PID=' + process.pid)
beforeAll(() => {
  expect(setup()).toBe('setup')
  return () => {
    expect(teardown()).toBe('teardown')
  }
})
afterAll(() => {
  expect(teardown()).toBe('teardown')
})
