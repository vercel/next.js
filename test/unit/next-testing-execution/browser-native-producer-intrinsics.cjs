const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { isPromise } = require('node:util').types
const root =
  process.argv[2] || path.dirname(require.resolve('next/package.json'))
const mode = process.argv[3] || 'genuine'
const dir = path.join(root, 'dist/experimental/testing/client')
const Native = Promise
const nativePrototype = Native.prototype
let classifications = 0,
  accessorReads = 0,
  classifierDescriptorReads = 0,
  classifierAccessorReads = 0
const classifyTarget = (value) => {
  classifications++
  return isPromise(value)
    ? Object.getPrototypeOf(value) === nativePrototype
      ? 1
      : 2
    : 0
}
const classify = ['classifier-proxy', 'proxy-mismatch'].includes(mode)
  ? new Proxy(classifyTarget, {
      getOwnPropertyDescriptor() {
        classifierDescriptorReads++
        throw Error('synthetic classifier descriptor must stay unread')
      },
    })
  : classifyTarget
const key = Symbol.for('next.test.engine-native-promise-intrinsics.v1')
const Foreign = vm.runInNewContext('Promise')
const record =
  mode === 'mismatched'
    ? {
        constructor: Foreign,
        resolve: Foreign.resolve,
        prototype: Foreign.prototype,
      }
    : {
        constructor: Native,
        resolve: Native.resolve,
        prototype: nativePrototype,
      }
Object.assign(record, {
  classify:
    mode === 'identity-mismatch'
      ? function otherClassifier() {}
      : mode === 'proxy-mismatch'
        ? classifyTarget
        : classify,
  then: record.constructor.prototype.then,
  apply: Reflect.apply,
  reflect: Reflect,
  hasRpcPromise: () => false,
  constructorDescriptor: Object.freeze(
    Object.getOwnPropertyDescriptor(record.prototype, 'constructor')
  ),
  speciesDescriptor: Object.freeze(
    Object.getOwnPropertyDescriptor(record.constructor, Symbol.species)
  ),
  species: Symbol.species,
})
if (mode === 'accessor')
  Object.defineProperty(globalThis, key, {
    get() {
      accessorReads++
      throw Error('must not read accessor')
    },
  })
else if (!['missing', 'classifier-proxy'].includes(mode))
  Object.defineProperty(globalThis, key, { value: Object.freeze(record) })
Object.defineProperty(
  globalThis,
  Symbol.for('next.test.engine-promise-brand.v1'),
  mode === 'classifier-accessor'
    ? {
        get() {
          classifierAccessorReads++
          return classify
        },
        configurable: true,
      }
    : { value: classify, configurable: true }
)
const {
  createClientNativePromise: create,
  knownClientNativePromiseRoute: known,
} = require(path.join(dir, 'native-promise-allocation.js'))
const exact = require(
  path.join(dir, 'engine-brand-contract.js')
).isExactNativePromise
const creator = require(
  path.join(dir, 'engine-brand-creator.js')
).isExactNativePromise
let cases = 0
function check(value, route, expectedExact, expectedCreator, fallbacks) {
  const start = classifications
  assert.equal(known(value), route)
  assert.equal(exact(value), expectedExact)
  assert.equal(creator(value), expectedCreator)
  assert.equal(classifications - start, fallbacks)
  cases++
}
async function main() {
  const enabled = mode === 'genuine'
  const made = create(Native, (resolve) => resolve(1))
  check(made, enabled ? 1 : undefined, true, true, enabled ? 0 : 2)
  assert.equal(await made, 1)
  if (!enabled) {
    let constructors = 0
    function Double(executor) {
      constructors++
      assert.equal(new.target, Double)
      const result = {}
      executor(
        (value) => {
          result.value = value
        },
        (error) => {
          result.error = error
        }
      )
      return result
    }
    const doubled = create(Double, (resolve) => resolve(2))
    assert.deepEqual(doubled, { value: 2 })
    assert.equal(constructors, 1)
    check(doubled, undefined, false, false, 2)
    assert.equal(accessorReads, 0)
    assert.equal(classifierDescriptorReads, 0)
    assert.equal(
      classifierAccessorReads,
      mode === 'classifier-accessor' ? 2 : 0
    )
    console.log(
      JSON.stringify({
        mode,
        cases,
        unknownFallback: true,
        actualConstructorCallsPreserved: true,
        noBridgeGetterInvocation: true,
        classifierDescriptorReads,
        classifierAccessorReads,
      })
    )
    return
  }
  for (const value of [null, undefined, 0, '', false])
    check(value, undefined, false, false, 0)
  check({}, undefined, false, false, 2)
  check(Native.resolve(3), undefined, true, true, 2)
  Object.setPrototypeOf(made, Object.create(nativePrototype))
  check(made, 2, false, true, 0)
  Object.setPrototypeOf(made, nativePrototype)
  check(made, 1, true, true, 0)
  class Sub extends Native {}
  const sub = new Sub((resolve) => resolve(4))
  check(sub, undefined, false, true, 2)
  const foreign = new Foreign((resolve) => resolve(5))
  check(foreign, undefined, false, true, 2)
  let reads = 0
  const thenable = {
    get then() {
      reads++
      throw Error('then read')
    },
    get constructor() {
      reads++
      throw Error('constructor read')
    },
  }
  check(thenable, undefined, false, false, 2)
  assert.equal(reads, 0)
  const proxy = new Proxy(Native.resolve(6), {
    get() {
      reads++
      throw Error('proxy read')
    },
    getPrototypeOf() {
      reads++
      throw Error('proxy prototype')
    },
  })
  check(proxy, undefined, false, false, 2)
  assert.equal(reads, 0)
  const identity = create(Native, (resolve) => resolve(7))
  Object.defineProperties(identity, {
    constructor: {
      get() {
        reads++
        throw Error('constructor read')
      },
    },
    then: {
      get() {
        reads++
        throw Error('then read')
      },
    },
  })
  check(identity, 1, true, true, 0)
  assert.equal(reads, 0)
  let constructCalls = 0,
    prototypeReads = 0
  const ProxyConstructor = new Proxy(Native, {
    construct(target, args, newTarget) {
      constructCalls++
      return Reflect.construct(target, args, newTarget)
    },
    get(target, key, receiver) {
      if (key === 'prototype') prototypeReads++
      return Reflect.get(target, key, receiver)
    },
  })
  const proxied = create(ProxyConstructor, (resolve) => resolve(8))
  assert.equal(constructCalls, 1)
  assert.equal(prototypeReads, 1)
  check(proxied, undefined, true, true, 2)
  const thrown = new Error('actual executor')
  const rejected = create(Native, () => {
    throw thrown
  })
  check(rejected, 1, true, true, 0)
  await assert.rejects(rejected, (error) => error === thrown)
  const context = require(path.join(dir, 'async-context.js'))
  const late = []
  const a = context.createAsyncScope(
    {
      kind: 'attempt',
      context: {
        id: 'producer-A',
        name: 'producer A',
        testId: 'case-A',
        fileId: 'file',
      },
    },
    (error) => late.push(['A', error.message])
  )
  const b = context.createAsyncScope(
    {
      kind: 'attempt',
      context: {
        id: 'awaiter-B',
        name: 'awaiter B',
        testId: 'case-B',
        fileId: 'file',
      },
    },
    (error) => late.push(['B', error.message])
  )
  let complete, finish
  const pending = a.run(() =>
    create(Native, (resolve) => {
      complete = resolve
    })
  )
  const observed = new Native((resolve) => {
    finish = resolve
  })
  b.run(() =>
    context.captureContinuationScope().resume(
      pending,
      (value) => {
        assert.equal(value, 'settled')
        assert.equal(context.getConsoleTask().caseId, 'case-B')
        assert.throws(
          () => context.assertScopeActive(),
          /closed attempt scope "awaiter B"/
        )
        finish()
      },
      (error) => {
        throw error
      }
    )
  )
  b.close()
  a.run(() => complete('settled'))
  await observed
  assert.deepEqual(
    late.map(([owner]) => owner),
    ['B']
  )
  assert.equal(context.getConsoleTask(), undefined)
  cases++
  let fakeGlobalCalls = 0
  function FakeGlobal() {
    fakeGlobalCalls++
    throw Error('late global constructor used')
  }
  globalThis.Promise = FakeGlobal
  try {
    const captured = create(Native, (resolve) => resolve(9))
    check(captured, 1, true, true, 0)
    assert.equal(await captured, 9)
    assert.equal(fakeGlobalCalls, 0)
  } finally {
    globalThis.Promise = Native
  }
  let thenCases = 0
  const nativeReflect = Reflect
  const nativeApply = Reflect.apply
  const then = record.then
  const make = () => create(Native, (resolve) => resolve(12))
  const normal = make().then((value) => value + 1)
  assert.equal(known(normal), 1)
  assert.equal(await normal, 13)
  thenCases++
  const caught = make().catch(() => 0)
  assert.equal(known(caught), 1)
  assert.equal(await caught, 12)
  thenCases++
  const constructorDescriptor = Object.getOwnPropertyDescriptor(
    nativePrototype,
    'constructor'
  )
  let constructorReads = 0
  Object.defineProperty(nativePrototype, 'constructor', {
    configurable: true,
    get() {
      constructorReads++
      return Native
    },
  })
  let altered
  try {
    altered = make().then()
    assert.equal(known(altered), undefined)
    assert.equal(constructorReads, 1)
  } finally {
    Object.defineProperty(nativePrototype, 'constructor', constructorDescriptor)
  }
  await altered
  thenCases++
  const speciesDescriptor = Object.getOwnPropertyDescriptor(
    Native,
    Symbol.species
  )
  let speciesReads = 0,
    speciesConstructs = 0
  function Species(executor) {
    speciesConstructs++
    const value = {}
    executor(
      (result) => {
        value.result = result
      },
      (error) => {
        value.error = error
      }
    )
    return value
  }
  Object.defineProperty(Native, Symbol.species, {
    configurable: true,
    get() {
      speciesReads++
      return Species
    },
  })
  let authoredSpecies
  try {
    authoredSpecies = make().then()
    assert.equal(known(authoredSpecies), undefined)
    assert.equal(speciesReads, 1)
    assert.equal(speciesConstructs, 1)
  } finally {
    Object.defineProperty(Native, Symbol.species, speciesDescriptor)
  }
  thenCases++
  delete nativePrototype.constructor
  try {
    altered = make().then()
    assert.equal(known(altered), undefined)
  } finally {
    Object.defineProperty(nativePrototype, 'constructor', constructorDescriptor)
  }
  await altered
  thenCases++
  delete Native[Symbol.species]
  try {
    altered = make().then()
    assert.equal(known(altered), undefined)
  } finally {
    Object.defineProperty(Native, Symbol.species, speciesDescriptor)
  }
  await altered
  thenCases++
  const ownConstructor = make()
  Object.defineProperty(ownConstructor, 'constructor', { value: Native })
  altered = ownConstructor.then()
  assert.equal(known(altered), undefined)
  await altered
  thenCases++
  const thenGetter = make(),
    catchValue = {},
    rejection = () => 0
  let thenReads = 0,
    thenCalls = 0
  Object.defineProperty(thenGetter, 'then', {
    get() {
      thenReads++
      return function (fulfilled, rejected) {
        thenCalls++
        assert.equal(this, thenGetter)
        assert.equal(fulfilled, undefined)
        assert.equal(rejected, rejection)
        return catchValue
      }
    },
  })
  assert.equal(thenGetter.catch(rejection), catchValue)
  assert.equal(known(catchValue), undefined)
  assert.equal(thenReads, 1)
  assert.equal(thenCalls, 1)
  thenCases++
  const applyDescriptor = Object.getOwnPropertyDescriptor(
    nativeReflect,
    'apply'
  )
  let applyReads = 0
  Object.defineProperty(nativeReflect, 'apply', {
    configurable: true,
    get() {
      applyReads++
      return nativeApply
    },
  })
  try {
    altered = make().then()
    assert.equal(known(altered), undefined)
    assert.equal(applyReads, 1)
  } finally {
    Object.defineProperty(nativeReflect, 'apply', applyDescriptor)
  }
  await altered
  thenCases++
  let applyCalls = 0
  Object.defineProperty(nativeReflect, 'apply', {
    ...applyDescriptor,
    value: function (target, receiver, args) {
      applyCalls++
      assert.equal(this, nativeReflect)
      return nativeApply(target, receiver, args)
    },
  })
  try {
    altered = make().then()
    assert.equal(known(altered), undefined)
    assert.equal(applyCalls, 1)
  } finally {
    Object.defineProperty(nativeReflect, 'apply', applyDescriptor)
  }
  await altered
  thenCases++
  Object.defineProperty(nativeReflect, 'apply', {
    ...applyDescriptor,
    value: 0,
  })
  try {
    assert.throws(
      () => make().then(),
      (error) =>
        error instanceof TypeError &&
        error.message === 'Reflect.apply is not a function'
    )
  } finally {
    Object.defineProperty(nativeReflect, 'apply', applyDescriptor)
  }
  thenCases++
  const sentinel = new Error('actual apply getter')
  Object.defineProperty(nativeReflect, 'apply', {
    configurable: true,
    get() {
      throw sentinel
    },
  })
  try {
    assert.throws(
      () => make().then(),
      (error) => error === sentinel
    )
  } finally {
    Object.defineProperty(nativeReflect, 'apply', applyDescriptor)
  }
  thenCases++

  const contextPath = require.resolve(path.join(dir, 'async-context.js'))
  const originalExports = require.cache[contextPath].exports
  const events = []
  function Double(executor) {
    events.push('construct')
    assert.equal(new.target, Double)
    const result = {}
    executor(
      (value) => {
        events.push('resolve')
        result.value = value
      },
      (error) => {
        events.push('reject')
        result.error = error
      }
    )
    return result
  }
  const scope = {
    run(fn) {
      events.push('scope')
      return fn()
    },
    resume() {
      throw Error('unexpected yield')
    },
  }
  require.cache[contextPath].exports = {
    ...originalExports,
    NativePromise: Double,
    captureContinuationScope: () => scope,
  }
  try {
    const helper = require(path.join(dir, 'async-helper.js'))._
    const output = helper(function* () {
      events.push('body')
      return 10
    })()
    assert.deepEqual(output, { value: 10 })
    assert.deepEqual(events, ['construct', 'scope', 'scope', 'body', 'resolve'])
    check(output, undefined, false, false, 2)
  } finally {
    require.cache[contextPath].exports = originalExports
  }
  assert.equal(accessorReads, 0)
  console.log(
    JSON.stringify({
      mode,
      cases,
      actualAllocationOnly: true,
      currentNativeAndCreatorRoutes: true,
      unknownThenableProxyAndSubclassPreserved: true,
      actualConstructorAndGetterEffects: true,
      closedAwaiterRetained: true,
      syntheticAsyncHelperConstructorPreserved: true,
      thenCases,
      speciesGetterApplyAndDynamicCatchEffects: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
