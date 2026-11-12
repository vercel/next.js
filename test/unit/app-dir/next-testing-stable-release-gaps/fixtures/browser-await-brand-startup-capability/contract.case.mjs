import { test, expect } from 'vitest'

test('await uses its startup capability after global brand builtins change', async () => {
  const symbolFor = Symbol.for
  const getPrototypeOf = Object.getPrototypeOf
  const trace = []
  const promise = Promise.resolve('native')
  Object.defineProperties(promise, {
    then: {
      get() {
        trace.push('native:then')
        throw new Error('native await must ignore own then')
      },
    },
    constructor: {
      get() {
        trace.push('native:constructor')
        return Promise
      },
    },
  })
  let proxy
  proxy = new Proxy(
    {
      then(resolve) {
        trace.push(this === proxy ? 'proxy:then' : 'wrong receiver')
        resolve('proxy')
      },
    },
    {
      getPrototypeOf() {
        trace.push('proxy:getPrototypeOf')
        throw new Error('await must not inspect a Proxy prototype')
      },
      get(target, property, receiver) {
        trace.push(`proxy:get:${String(property)}`)
        return Reflect.get(target, property, receiver)
      },
    }
  )
  let values
  try {
    Symbol.for = () => {
      trace.push('global:Symbol.for')
      throw new Error('await must use its captured startup capability')
    }
    Object.getPrototypeOf = () => {
      trace.push('global:getPrototypeOf')
      throw new Error('await must use its captured engine primitive')
    }
    values = [await promise, await proxy]
  } finally {
    Symbol.for = symbolFor
    Object.getPrototypeOf = getPrototypeOf
  }
  expect(values).toEqual(['native', 'proxy'])
  expect(trace).toEqual(['native:constructor', 'proxy:get:then', 'proxy:then'])
})

test('await preserves owned Promise subclass then callbacks', async () => {
  const trace = []
  class OwnedPromise extends Promise {
    then(resolve, reject) {
      trace.push('then')
      expect(typeof document.createElement).toBe('function')
      return super.then(resolve, reject)
    }
  }
  expect(await OwnedPromise.resolve(42)).toBe(42)
  expect(trace).toEqual(['then'])
})
