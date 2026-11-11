const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { isPromise } = require('node:util').types
const packageRoot =
  process.argv[2] || path.dirname(require.resolve('next/package.json'))
const mode = process.argv[3] || 'actual'
const dir = require('node:fs').realpathSync(
  path.join(packageRoot, 'dist/experimental/testing/client')
)
const NativeOuter = Promise
const NativeFetch = fetch
const NativeReflect = Reflect
const metadataKey = Symbol.for('next.test.engine-native-promise-intrinsics.v1')
const brandKey = Symbol.for('next.test.engine-promise-brand.v1')
let cases = 0,
  accessorReads = 0,
  descriptorReads = 0

async function main() {
  let source
  const session = new EventEmitter()
  session.send = async (method, values) => {
    if (method === 'Page.getFrameTree')
      return { frameTree: { frame: { id: 'main' } } }
    if (method === 'Page.addScriptToEvaluateOnNewDocument') {
      source = values.source
      return { identifier: 'owned' }
    }
    return {}
  }
  session.detach = async () => {}
  const failures = []
  const host = require(
    path.join(dir, 'engine-brand.js')
  ).createClientEngineBrand({
    context: { newCDPSession: async () => session },
    page: { isClosed: () => false },
    url: 'http://127.0.0.1:1/',
    signal: new AbortController().signal,
    onFailure: (error) => failures.push(error),
  })
  await host.start()
  host.close()
  await host.afterOwnersClosed()
  assert.deepEqual(failures, [])
  assert.ok(source.includes('constructPromise: authoredProducers.construct'))
  const realm = vm.createContext({ fetch: NativeFetch, Response })
  vm.runInContext('globalThis.top = globalThis', realm)
  vm.runInContext(source, realm)
  const actual = vm.runInContext(
    'globalThis[Symbol.for("next.test.engine-native-promise-intrinsics.v1")]',
    realm
  )
  const descriptor = vm.runInContext(
    'Object.getOwnPropertyDescriptor(globalThis, Symbol.for("next.test.engine-native-promise-intrinsics.v1"))',
    realm
  )
  assert.equal(descriptor.enumerable, false)
  assert.equal(descriptor.writable, false)
  assert.equal(descriptor.configurable, false)
  assert.equal(Object.isFrozen(actual), true)
  const Native = actual.constructor
  const classifyTarget = (value) =>
    isPromise(value)
      ? Object.getPrototypeOf(value) === Native.prototype
        ? 1
        : 2
      : 0
  const classify =
    mode === 'actual'
      ? actual.classify
      : mode === 'proxy-classifier'
        ? new Proxy(classifyTarget, {
            getOwnPropertyDescriptor() {
              descriptorReads++
              throw Error('classifier must not be probed')
            },
          })
        : classifyTarget
  let record = mode === 'actual' ? actual : { ...actual, classify }
  if (mode === 'identity-mismatch')
    record.classify = function otherClassifier() {}
  if (mode === 'factory-accessor') {
    for (const key of ['constructPromise', 'callFetch'])
      Object.defineProperty(record, key, {
        get() {
          accessorReads++
          throw Error('factory getter must not run')
        },
      })
  }
  if (mode === 'older-carrier') {
    delete record.constructPromise
    delete record.callFetch
  }
  Object.defineProperty(globalThis, brandKey, { value: classify })
  if (mode === 'carrier-accessor')
    Object.defineProperty(globalThis, metadataKey, {
      get() {
        accessorReads++
        throw Error('carrier getter must not run')
      },
    })
  else if (!['missing', 'proxy-classifier'].includes(mode))
    Object.defineProperty(globalThis, metadataKey, {
      value: Object.freeze(record),
    })
  for (const key of Object.keys(require.cache))
    if (key.startsWith(dir + path.sep)) delete require.cache[key]
  const {
    bindNativePromiseConstructor: bindConstructor,
    bindNativeFetchCall: bindFetch,
  } = require(path.join(dir, 'promise-static-call.js'))
  const marked = (value) => actual.hasRpcPromise(value)
  const native = bindConstructor(Native)((resolve) => resolve(7), 'extra')
  assert.equal(isPromise(native), true)
  assert.equal(await native, 7)
  assert.equal(marked(native), mode === 'actual')
  cases++
  const trace = []
  const selected = () => {
    trace.push('callee')
    return Native
  }
  const extra = (name) => {
    trace.push(name)
    return name
  }
  assert.equal(
    await bindConstructor(selected())(
      (resolve) => {
        trace.push('executor')
        resolve(8)
      },
      extra('second'),
      extra('third')
    ),
    8
  )
  assert.deepEqual(trace, ['callee', 'second', 'third', 'executor'])
  cases++
  const object = {},
    marker = new Error('authored producer marker')
  let count = 0
  function Custom(executor, second, third) {
    count++
    assert.equal(new.target, Custom)
    assert.equal(arguments.length, 3)
    assert.equal(second, 2)
    assert.equal(third, 3)
    return object
  }
  assert.equal(
    bindConstructor(Custom)(() => {}, 2, 3),
    object
  )
  assert.equal(count, 1)
  assert.equal(marked(object), false)
  cases++
  const effects = []
  let proxy
  proxy = new Proxy(Native, {
    construct(target, args, newTarget) {
      effects.push(['construct', newTarget === proxy, args.length])
      return NativeReflect.construct(target, args, newTarget)
    },
    get(target, key, receiver) {
      effects.push(['get', String(key)])
      return NativeReflect.get(target, key, receiver)
    },
  })
  const proxied = bindConstructor(proxy)((resolve) => resolve(9), 2, 3)
  assert.equal(await proxied, 9)
  assert.equal(marked(proxied), false)
  assert.deepEqual(effects, [
    ['construct', true, 3],
    ['get', 'prototype'],
  ])
  cases++
  const bound = Native.bind(null),
    bounded = bindConstructor(bound)((resolve) => resolve(10))
  assert.equal(await bounded, 10)
  assert.equal(marked(bounded), false)
  cases++
  class Sub extends Native {}
  const subclass = bindConstructor(Sub)((resolve) => resolve(11))
  assert.equal(await subclass, 11)
  assert.equal(marked(subclass), false)
  cases++
  assert.throws(
    () => bindConstructor(() => {})(() => {}),
    (error) =>
      error.name === 'TypeError' &&
      error.message === 'Promise is not a constructor'
  )
  assert.throws(
    () => bindConstructor(Native)('not-callable'),
    (error) =>
      error.name === 'TypeError' &&
      error.message === 'Promise resolver not-callable is not a function'
  )
  cases++
  function Throwing() {
    throw marker
  }
  assert.throws(
    () => bindConstructor(Throwing)(),
    (error) => error === marker
  )
  cases++
  const symbol = Symbol.iterator,
    originalIterator = Object.getOwnPropertyDescriptor(Array.prototype, symbol)
  const iteratorPrototype = Object.getPrototypeOf([][symbol]()),
    originalNext = Object.getOwnPropertyDescriptor(iteratorPrototype, 'next')
  let iteratorReads = 0,
    pending,
    fetched
  try {
    Object.defineProperty(Array.prototype, symbol, {
      configurable: true,
      get() {
        iteratorReads++
        throw marker
      },
    })
    Object.defineProperty(iteratorPrototype, 'next', {
      configurable: true,
      get() {
        iteratorReads++
        throw marker
      },
    })
    pending = bindConstructor(Native)((resolve) => resolve(12), 'extra')
    fetched = bindFetch(function () {
      return object
    })('url', {}, 'extra')
  } finally {
    Object.defineProperty(Array.prototype, symbol, originalIterator)
    Object.defineProperty(iteratorPrototype, 'next', originalNext)
  }
  assert.equal(await pending, 12)
  assert.equal(fetched, object)
  assert.equal(iteratorReads, 0)
  cases++
  let fetchCalls = 0
  const options = {}
  function CustomFetch(url, init, third) {
    'use strict'
    fetchCalls++
    assert.equal(this, undefined)
    assert.equal(url, 'url')
    assert.equal(init, options)
    assert.equal(third, 3)
    assert.equal(arguments.length, 3)
    return object
  }
  assert.equal(bindFetch(CustomFetch)('url', options, 3), object)
  assert.equal(fetchCalls, 1)
  assert.equal(marked(object), false)
  cases++
  assert.throws(
    () => bindFetch(37)('url'),
    (error) =>
      error.name === 'TypeError' && error.message === 'fetch is not a function'
  )
  assert.throws(
    () =>
      bindFetch(function () {
        throw marker
      })(),
    (error) => error === marker
  )
  cases++
  const reflectDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'Reflect'
  )
  let reflectReads = 0
  try {
    Object.defineProperty(globalThis, 'Reflect', {
      configurable: true,
      get() {
        reflectReads++
        throw marker
      },
    })
    pending = bindConstructor(Native)((resolve) => resolve(13))
    fetched = bindFetch(CustomFetch)('url', options, 3)
  } finally {
    Object.defineProperty(globalThis, 'Reflect', reflectDescriptor)
  }
  assert.equal(await pending, 13)
  assert.equal(fetched, object)
  assert.equal(reflectReads, 0)
  cases++
  const responsePromise = bindFetch(NativeFetch)('data:text/plain,producer')
  assert.equal(isPromise(responsePromise), true)
  assert.equal(marked(responsePromise), mode === 'actual')
  assert.equal(await (await responsePromise).text(), 'producer')
  cases++
  const controller = new AbortController()
  controller.abort(marker)
  const aborted = bindFetch(NativeFetch)('data:text/plain,aborted', {
    signal: controller.signal,
  })
  assert.equal(marked(aborted), mode === 'actual')
  await assert.rejects(aborted, (error) => error === marker)
  cases++
  Object.setPrototypeOf(native, Object.create(Native.prototype))
  assert.equal(classify(native), 2)
  assert.equal(
    require(path.join(dir, 'engine-brand-contract.js')).isExactNativePromise(
      native
    ),
    false
  )
  assert.equal(
    require(path.join(dir, 'engine-brand-creator.js')).isExactNativePromise(
      native
    ),
    true
  )
  cases++
  const context = require(path.join(dir, 'async-context.js'))
  const late = []
  const a = context.createAsyncScope(
    { kind: 'attempt', context: { id: 'authored-producer-A', name: 'A' } },
    (error) => late.push(error)
  )
  const b = context.createAsyncScope(
    { kind: 'attempt', context: { id: 'authored-producer-B', name: 'B' } },
    (error) => late.push(error)
  )
  let release
  const prior = a.run(() =>
    bindConstructor(Native)((resolve) => {
      release = resolve
    })
  )
  a.close()
  let finish, fail
  const done = new NativeOuter((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  b.run(() =>
    context.captureContinuationScope().resume(
      prior,
      (value) => {
        try {
          assert.equal(value, 14)
          assert.equal(
            context.getFileAssertionOrigin().id,
            'authored-producer-B'
          )
          finish()
        } catch (error) {
          fail(error)
        }
      },
      fail
    )
  )
  release(14)
  await done
  b.close()
  assert.deepEqual(late, [])
  cases++
  assert.equal(accessorReads, 0)
  assert.equal(descriptorReads, 0)
  console.log(
    JSON.stringify({
      mode,
      cases,
      actualInitializerSourceCaptured: true,
      nativeCustomProxyBoundSubclassAndForeignValuesPreserved: true,
      naturalErrorsAndNewTargetPreserved: true,
      argumentIteratorAndReflectEffects: 0,
      lateAwaiterRetained: true,
      arbitraryValuesUnmarked: true,
      accessorReads,
      descriptorReads,
      actualBrowserAuthenticationNotClaimedByComponent: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
