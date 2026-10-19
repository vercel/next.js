import { test, expect } from 'vitest'
test('browser awaits preserve native promises and thenable origin', async () => {
  const native = Promise.resolve('native')
  Object.defineProperty(native, 'then', {
    value() {
      throw new Error('native await must ignore an own then property')
    },
  })
  expect(await native).toBe('native')
  const reason = new Error('constructor getter rejection')
  const abrupt = Promise.resolve('abrupt')
  Object.defineProperty(abrupt, 'constructor', {
    get() {
      throw reason
    },
  })
  await Promise.resolve()
  let caught
  try {
    await abrupt
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(reason)
  const order = []
  const result = await {
    get then() {
      order.push('getter')
      expect(typeof window).toBe('object')
      return (resolve) => {
        order.push('then')
        expect(document.nodeType).toBe(9)
        resolve({
          then(resolveNested) {
            order.push('nested')
            expect(typeof document.createElement).toBe('function')
            resolveNested(42)
          },
        })
      }
    },
  }
  expect(result).toBe(42)
  expect(order).toEqual(['getter', 'then', 'nested'])
  async function* values() {
    yield await Promise.resolve(1)
    await Promise.resolve()
    yield 2
  }
  const observed = []
  for await (const value of values()) observed.push(value)
  expect(observed).toEqual([1, 2])
})
