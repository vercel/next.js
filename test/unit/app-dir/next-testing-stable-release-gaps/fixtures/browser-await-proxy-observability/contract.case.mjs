import { test, expect, afterAll } from 'vitest'
const observed = {}

test('await ordinary Proxy thenable without inspecting its prototype', async () => {
  const trace = (observed.ordinary = [])
  let proxy
  proxy = new Proxy(
    {
      then(resolve) {
        trace.push(this === proxy ? 'call:then:proxy' : 'call:then:other')
        expect(typeof document).toBe('object')
        resolve('ordinary')
      },
    },
    {
      getPrototypeOf(target) {
        trace.push('getPrototypeOf')
        return Reflect.getPrototypeOf(target)
      },
      get(target, property, receiver) {
        trace.push(`get:${String(property)}`)
        return Reflect.get(target, property, receiver)
      },
    }
  )
  expect(await proxy).toBe('ordinary')
  expect(trace).toEqual(['get:then', 'call:then:proxy'])
})

test('await does not invoke a throwing Proxy getPrototypeOf trap', async () => {
  const trace = (observed.throwingPrototype = [])
  const reason = new Error('native await must not inspect Proxy prototype')
  const proxy = new Proxy(
    {
      then(resolve) {
        trace.push('call:then')
        expect(typeof window).toBe('object')
        resolve('throwing prototype')
      },
    },
    {
      getPrototypeOf() {
        trace.push('getPrototypeOf')
        throw reason
      },
      get(target, property, receiver) {
        trace.push(`get:${String(property)}`)
        return Reflect.get(target, property, receiver)
      },
    }
  )
  expect(await proxy).toBe('throwing prototype')
  expect(trace).toEqual(['get:then', 'call:then'])
})

test('await genuine Promise ignores own then and reads constructor once', async () => {
  const trace = (observed.nativePromise = [])
  const promise = Promise.resolve('native promise')
  Object.defineProperties(promise, {
    then: {
      get() {
        trace.push('get:then')
        throw new Error('native Promise await must ignore own then')
      },
    },
    constructor: {
      get() {
        trace.push('get:constructor')
        return Promise
      },
    },
  })
  expect(await promise).toBe('native promise')
  expect(trace).toEqual(['get:constructor'])
})

test('await genuine Promise constructor abrupt completion stays catchable', async () => {
  const trace = (observed.abruptConstructor = [])
  const reason = new Error('owned native Promise constructor rejection')
  const promise = Promise.resolve('unused')
  Object.defineProperties(promise, {
    then: {
      get() {
        trace.push('get:then')
        throw new Error('abrupt Promise await must ignore own then')
      },
    },
    constructor: {
      get() {
        trace.push('get:constructor')
        throw reason
      },
    },
  })
  let caught
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(reason)
  expect(trace).toEqual(['get:constructor'])
})

afterAll(() => {
  console.log('PROXY_AWAIT_TRACE=' + JSON.stringify(observed))
})
