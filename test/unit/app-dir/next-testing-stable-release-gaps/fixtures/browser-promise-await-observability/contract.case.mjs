import { test, expect } from 'vitest'

function report(name, trace, outcome) {
  const record = { name, trace: [...trace], outcome }
  ;(globalThis.promiseConformance75 ??= []).push(record)
  console.log('PROMISE_CONFORMANCE75 ' + JSON.stringify(record))
}
function observeThen(value, trace, implementation) {
  Object.defineProperty(value, 'then', {
    configurable: true,
    get() {
      trace.push('then:get')
      return function (...args) {
        trace.push('then:call')
        return Reflect.apply(implementation, this, args)
      }
    },
  })
}
function observeConstructor(value, trace, result) {
  Object.defineProperty(value, 'constructor', {
    configurable: true,
    get() {
      trace.push('constructor:get')
      return result()
    },
  })
}

test('native Promise with matching constructor ignores own then', async () => {
  const trace = []
  const value = Promise.resolve(7)
  observeConstructor(value, trace, () => Promise)
  observeThen(value, trace, () => {
    throw new Error('own then must be ignored')
  })
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('native-match', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['constructor:get', 'value:7'])
})

test('native Promise with undefined constructor uses own then', async () => {
  const trace = []
  const value = Promise.resolve(7)
  observeConstructor(value, trace, () => undefined)
  observeThen(value, trace, (resolve) => resolve(11))
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('native-undefined-constructor', trace, { result })
  }
  expect(result).toBe(11)
  expect(trace).toEqual([
    'constructor:get',
    'then:get',
    'then:call',
    'value:11',
  ])
})

test('native Promise with foreign constructor uses own then', async () => {
  const trace = []
  const value = Promise.resolve(7)
  observeConstructor(value, trace, () => ({ unrelated: true }))
  observeThen(value, trace, (resolve) => resolve(13))
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('native-foreign-constructor', trace, { result })
  }
  expect(result).toBe(13)
  expect(trace).toEqual([
    'constructor:get',
    'then:get',
    'then:call',
    'value:13',
  ])
})

test('native Promise abrupt constructor is read before own then', async () => {
  const trace = []
  const reason = new Error('abrupt constructor')
  const value = Promise.resolve(7)
  observeConstructor(value, trace, () => {
    throw reason
  })
  observeThen(value, trace, (resolve) => resolve(11))
  let caught
  try {
    await value
  } catch (error) {
    caught = error
    trace.push('caught')
  } finally {
    report('native-abrupt-constructor', trace, { caught: caught?.message })
  }
  expect(caught).toBe(reason)
  expect(trace).toEqual(['constructor:get', 'caught'])
})

test('Promise subclass await reads constructor before then and species', async () => {
  const trace = []
  class Sub extends Promise {
    static get [Symbol.species]() {
      trace.push('species:get')
      return Promise
    }
  }
  const value = Sub.resolve(7)
  observeConstructor(value, trace, () => Sub)
  observeThen(value, trace, Promise.prototype.then)
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('subclass-species', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual([
    'constructor:get',
    'then:get',
    'then:call',
    'constructor:get',
    'species:get',
    'value:7',
  ])
})

test('Promise subclass matching constructor ignores own then', async () => {
  const trace = []
  class Sub extends Promise {}
  const value = Sub.resolve(7)
  observeConstructor(value, trace, () => Promise)
  observeThen(value, trace, () => {
    throw new Error('subclass own then must be ignored')
  })
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('subclass-matching-constructor', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['constructor:get', 'value:7'])
})

test('Promise subclass abrupt constructor precedes own then', async () => {
  const trace = []
  class Sub extends Promise {}
  const reason = new Error('subclass abrupt constructor')
  const value = Sub.resolve(7)
  observeConstructor(value, trace, () => {
    throw reason
  })
  observeThen(value, trace, Promise.prototype.then)
  let caught
  try {
    await value
  } catch (error) {
    caught = error
    trace.push('caught')
  } finally {
    report('subclass-abrupt-constructor', trace, { caught: caught?.message })
  }
  expect(caught).toBe(reason)
  expect(trace).toEqual(['constructor:get', 'caught'])
})

test('Promise subclass invalid constructor preserves rejection observations', async () => {
  const trace = []
  class Sub extends Promise {}
  const value = Sub.resolve(7)
  observeConstructor(value, trace, () => 0)
  observeThen(value, trace, Promise.prototype.then)
  let caught
  try {
    await value
  } catch (error) {
    caught = error
    trace.push('caught:' + error.name)
  } finally {
    report('subclass-invalid-constructor', trace, { caught: caught?.name })
  }
  expect(caught).toBeInstanceOf(TypeError)
  expect(trace).toEqual([
    'constructor:get',
    'then:get',
    'then:call',
    'constructor:get',
    'caught:TypeError',
  ])
})

test('genuine Promise altered prototype still ignores own then', async () => {
  const trace = []
  const value = Promise.resolve(7)
  Object.setPrototypeOf(value, Object.create(Promise.prototype))
  observeConstructor(value, trace, () => Promise)
  observeThen(value, trace, () => {
    throw new Error('altered own then must be ignored')
  })
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('altered-prototype', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['constructor:get', 'value:7'])
})

test('genuine Promise null prototype retains native await value', async () => {
  const trace = []
  const value = Promise.resolve(7)
  Object.setPrototypeOf(value, null)
  observeConstructor(value, trace, () => Promise)
  let result
  try {
    result = await value
    trace.push(result === value ? 'value:original-promise' : 'value:' + result)
  } finally {
    report('null-prototype', trace, {
      originalPromise: result === value,
      primitive: typeof result === 'number' ? result : undefined,
    })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['constructor:get', 'value:7'])
})

test('genuine Promise proxy prototype observes only constructor lookup', async () => {
  const trace = []
  const value = Promise.resolve(7)
  const prototype = new Proxy(Object.create(null), {
    get(_target, key) {
      trace.push('prototype:get:' + String(key))
      if (key === 'constructor') return Promise
      if (key === 'then')
        return function (resolve) {
          trace.push('prototype:then:call')
          resolve(19)
        }
    },
  })
  Object.setPrototypeOf(value, prototype)
  let result
  try {
    result = await value
    trace.push('value:' + result)
  } finally {
    report('proxy-prototype', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['prototype:get:constructor', 'value:7'])
})

test('default Promise subclass then body keeps browser assertion access', async () => {
  const trace = []
  class Sub extends Promise {
    then(...args) {
      trace.push('subclass:then')
      expect(typeof window).toBe('object')
      return super.then(...args)
    }
  }
  let result
  try {
    result = await Sub.resolve(7)
    trace.push('value:' + result)
  } finally {
    report('subclass-owned-api', trace, { result })
  }
  expect(result).toBe(7)
  expect(trace).toEqual(['subclass:then', 'value:7'])
})

test('native Promise divergent constructor then body keeps browser assertion access', async () => {
  const trace = []
  const value = Promise.resolve(7)
  observeConstructor(value, trace, () => undefined)
  observeThen(value, trace, (resolve) => {
    expect(typeof window).toBe('object')
    resolve(7)
  })
  let result
  let caught
  try {
    result = await value
    trace.push('value:' + result)
  } catch (error) {
    caught = error
    trace.push('caught:' + error.message)
  } finally {
    report('native-divergent-owned-api', trace, {
      result,
      caught: caught?.message,
    })
  }
  expect(caught).toBeUndefined()
  expect(result).toBe(7)
  expect(trace).toEqual(['constructor:get', 'then:get', 'then:call', 'value:7'])
})
