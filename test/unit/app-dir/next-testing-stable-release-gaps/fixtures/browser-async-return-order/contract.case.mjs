import { test, expect } from 'vitest'
test('browser async returns preserve object getters and microtask order', async () => {
  let reads = 0
  const object = {
    get then() {
      reads++
      expect(typeof window).toBe('object')
      return undefined
    },
  }
  async function identity(value) {
    return value
  }
  expect(await identity(object)).toBe(object)
  expect(reads).toBe(1)
  const resumed = []
  async function afterAwait() {
    await Promise.resolve()
    resumed.push('after await')
  }
  const pending = afterAwait()
  queueMicrotask(() => resumed.push('queued'))
  await pending
  expect(resumed).toEqual(['after await', 'queued'])
  const returned = []
  const immediate = identity('value')
  immediate.then(() => returned.push('returned'))
  queueMicrotask(() => returned.push('queued'))
  await immediate
  expect(returned).toEqual(['returned', 'queued'])
})
