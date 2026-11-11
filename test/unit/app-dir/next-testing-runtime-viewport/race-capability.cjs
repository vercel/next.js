const assert = require('node:assert/strict')
const { createHook } = require('node:async_hooks')
const path = require('node:path')
const { isPromise } = require('node:util').types
const root = process.argv[2]
const mode = process.argv[3]
assert(['actual', 'missing-race', 'accessor-race'].includes(mode))
const Native = Promise,
  race = Native.race,
  resolve = Native.resolve
const prototype = Native.prototype,
  own = Object.getOwnPropertyDescriptor
let classifications = 0,
  intrinsicAccessorReads = 0
function classify(value) {
  classifications++
  return isPromise(value)
    ? Object.getPrototypeOf(value) === prototype
      ? 1
      : 2
    : 0
}
const record = { constructor: Native, resolve, prototype, classify }
if (mode === 'actual') record.race = race
if (mode === 'accessor-race')
  Object.defineProperty(record, 'race', {
    get() {
      intrinsicAccessorReads++
      throw Error('intrinsic accessor must remain unread')
    },
  })
Object.defineProperty(
  globalThis,
  Symbol.for('next.test.engine-promise-brand.v1'),
  { value: classify }
)
Object.defineProperty(
  globalThis,
  Symbol.for('next.test.engine-native-promise-intrinsics.v1'),
  { value: Object.freeze(record) }
)
const directory = path.join(root, 'dist/experimental/testing/client')
const {
  bindClientNativePromiseRace: bind,
  knownClientNativePromiseRoute: known,
} = require(path.join(directory, 'native-promise-allocation.js'))
const exact = require(
  path.join(directory, 'engine-brand-contract.js')
).isExactNativePromise
const creator = require(
  path.join(directory, 'engine-brand-creator.js')
).isExactNativePromise
let cases = 0
function receipt(value, expected) {
  assert.equal(known(value), expected)
  const before = classifications
  assert.equal(
    exact(value),
    isPromise(value) && Object.getPrototypeOf(value) === prototype
  )
  assert.equal(creator(value), isPromise(value))
  assert.equal(classifications - before, expected === undefined ? 2 : 0)
}
const enabled = mode === 'actual'
async function main() {
  let active = false,
    allocations = 0
  const hook = createHook({
    init(_id, type) {
      if (active && type === 'PROMISE') allocations++
    },
  }).enable()
  function counted(operation) {
    allocations = 0
    active = true
    try {
      return { value: operation(), allocations }
    } finally {
      active = false
    }
  }
  const direct = counted(() => race.call(Native, [1, 2]))
  const carried = counted(() => bind(Native)([1, 2]))
  assert.equal(carried.allocations, direct.allocations)
  assert.equal(carried.allocations, 5)
  receipt(carried.value, enabled ? 1 : undefined)
  assert.equal(await carried.value, await direct.value)
  cases++
  const supplied = Native.resolve(3),
    actual = bind(Native)([supplied])
  assert.notEqual(actual, supplied)
  assert.equal(known(supplied), undefined)
  receipt(actual, enabled ? 1 : undefined)
  assert.equal(await actual, 3)
  cases++

  const descriptor = own(Native, 'resolve')
  const log = [],
    iterable = {
      [Symbol.iterator]() {
        log.push('iterator')
        let index = 0
        return {
          next() {
            log.push('next:' + index)
            return index++ === 0 ? { value: 4, done: false } : { done: true }
          },
        }
      },
    }
  Object.defineProperty(Native, 'resolve', {
    configurable: true,
    get() {
      log.push(this === Native ? 'resolve-get-original' : 'resolve-get-other')
      return function (input) {
        log.push([
          this === Native ? 'resolve-call-original' : 'resolve-call-other',
          input,
          arguments.length,
        ])
        return Reflect.apply(resolve, this, [input])
      }
    },
  })
  let getterResult
  try {
    getterResult = bind(Native)(iterable)
  } finally {
    Object.defineProperty(Native, 'resolve', descriptor)
  }
  receipt(getterResult, enabled ? 1 : undefined)
  assert.equal(await getterResult, 4)
  assert.deepEqual(log, [
    'resolve-get-original',
    'iterator',
    'next:0',
    ['resolve-call-original', 4, 1],
    'next:1',
  ])
  cases++

  const getterFailure = { role: 'actual-resolve-getter-error' },
    getterLog = []
  Object.defineProperty(Native, 'resolve', {
    configurable: true,
    get() {
      getterLog.push(this === Native)
      throw getterFailure
    },
  })
  let failed
  try {
    failed = bind(Native)({
      [Symbol.iterator]() {
        throw Error('iterator must stay unread')
      },
    })
  } finally {
    Object.defineProperty(Native, 'resolve', descriptor)
  }
  receipt(failed, enabled ? 1 : undefined)
  await assert.rejects(failed, (error) => error === getterFailure)
  assert.deepEqual(getterLog, [true])
  cases++

  const iteratorFailure = { role: 'actual-iterator-error' },
    iteratorLog = []
  const broken = bind(Native)({
    [Symbol.iterator]() {
      iteratorLog.push('iterator')
      return {
        next() {
          iteratorLog.push('next')
          throw iteratorFailure
        },
      }
    },
  })
  receipt(broken, enabled ? 1 : undefined)
  await assert.rejects(broken, (error) => error === iteratorFailure)
  assert.deepEqual(iteratorLog, ['iterator', 'next'])
  cases++

  let constructions = 0,
    newTarget,
    resolveReceiver
  const constructor = new Proxy(Native, {
    construct(target, args, targetConstructor) {
      constructions++
      newTarget = targetConstructor
      return Reflect.construct(target, args, targetConstructor)
    },
    get(target, key, receiver) {
      if (key === 'resolve')
        return function (input) {
          resolveReceiver = this
          return Reflect.apply(resolve, this, [input])
        }
      return Reflect.get(target, key, receiver)
    },
  })
  const directExotic = race.call(constructor, [5])
  const originalConstructions = constructions
  assert.equal(await directExotic, 5)
  constructions = 0
  const exotic = bind(constructor)([5])
  assert.equal(constructions, originalConstructions)
  assert.equal(constructions, 2)
  assert.equal(newTarget, constructor)
  assert.equal(resolveReceiver, constructor)
  receipt(exotic, undefined)
  assert.equal(await exotic, 5)
  cases++

  const raceDescriptor = own(Native, 'race'),
    selectedLog = [],
    provided = Native.resolve(6)
  Object.defineProperty(Native, 'race', {
    configurable: true,
    get() {
      selectedLog.push('select')
      return function (input) {
        selectedLog.push(
          this === Native ? 'original-receiver' : 'other-receiver'
        )
        assert.equal(input, argumentsObject)
        return provided
      }
    },
  })
  const argumentsObject = [provided]
  let unknown
  try {
    unknown = bind(Native)((selectedLog.push('arguments'), argumentsObject))
  } finally {
    Object.defineProperty(Native, 'race', raceDescriptor)
  }
  assert.equal(unknown, provided)
  assert.deepEqual(selectedLog, ['select', 'arguments', 'original-receiver'])
  receipt(unknown, undefined)
  assert.equal(await unknown, 6)
  cases++

  const nonconstructor = { race }
  assert.throws(() => bind(nonconstructor)([]), TypeError)
  assert.throws(() => bind(null), TypeError)
  cases++
  hook.disable()
  assert.equal(intrinsicAccessorReads, 0)
  console.log(
    JSON.stringify({
      mode,
      cases,
      sameActualNativeAllocations: true,
      actualResolverGetterReceiverIteratorAndErrors: true,
      exoticConstructorAndCalleeOrderPreserved: true,
      noProvidedObjectReceipt: true,
      optionalIntrinsicAccessorUnread: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
