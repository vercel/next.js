const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const realm = process.argv[2]
assert(['node', 'jsdom'].includes(realm))
let dom
if (realm === 'jsdom') {
  const req = createRequire(require.resolve('jest-environment-jsdom'))
  const { JSDOM } = req(req.resolve('jsdom'))
  dom = new JSDOM('')
  for (const name of ['EventTarget', 'Event', 'AbortController', 'AbortSignal'])
    globalThis[name] = dom.window[name]
}
const NativeTarget = EventTarget,
  NativeEvent = Event,
  NativeSignal = AbortSignal
const target = new EventTarget(),
  calls = []
const nativeAdd = EventTarget.prototype.addEventListener
const invalid = {}
let nativeError
try {
  Reflect.apply(nativeAdd, target, ['actual', () => {}, { signal: invalid }])
} catch (error) {
  nativeError = {
    name: error.name,
    message: error.message,
    constructor: error.constructor,
  }
}
assert(nativeError)
function observeShadowedSignal(kind) {
  const actualTarget = new EventTarget()
  const controller = new AbortController(),
    signal = controller.signal
  const seen = []
  let reads = 0,
    caught
  const marker = new Error('actual authored aborted getter')
  Object.defineProperty(signal, 'aborted', {
    get() {
      reads++
      if (kind === 'throw') throw marker
      return true
    },
  })
  const callback = function (event) {
    seen.push([this === actualTarget, event.currentTarget === actualTarget])
  }
  try {
    actualTarget.addEventListener('actual-shadow', callback, { signal })
  } catch (error) {
    caught = {
      sameOriginal: error === marker,
      name: error.name,
      message: error.message,
    }
  }
  actualTarget.removeEventListener('actual-shadow', callback)
  actualTarget.dispatchEvent(new Event('actual-shadow'))
  controller.abort()
  return { reads, caught: caught ?? null, seen }
}
const nativeShadowObservations = ['true', 'throw'].map(observeShadowedSignal)
require('next/dist/experimental/testing/client/async-context')
assert.equal(EventTarget, NativeTarget)
assert.equal(Event, NativeEvent)
assert.equal(AbortSignal, NativeSignal)
const listener = function (event) {
  calls.push([this === target, event.currentTarget === target])
}
assert.deepEqual(
  ['true', 'throw'].map(observeShadowedSignal),
  nativeShadowObservations
)
const controller = new AbortController()
target.addEventListener('actual', listener, {
  once: true,
  signal: controller.signal,
})
target.addEventListener('actual', listener, { signal: controller.signal })
target.dispatchEvent(new Event('actual'))
target.dispatchEvent(new Event('actual'))
assert.deepEqual(calls, [[true, true]])
target.addEventListener('actual', listener, { signal: controller.signal })
controller.abort()
target.dispatchEvent(new Event('actual'))
assert.equal(calls.length, 1)
target.addEventListener('actual', listener, { signal: controller.signal })
target.dispatchEvent(new Event('actual'))
assert.equal(calls.length, 1)
target.addEventListener('actual', listener, { once: true })
target.dispatchEvent(new Event('actual'))
assert.equal(calls.length, 2)
try {
  target.addEventListener('actual', listener, { signal: invalid })
  assert.fail('Expected actual native signal validation')
} catch (error) {
  assert.equal(error.name, nativeError.name)
  assert.equal(error.message, nativeError.message)
  assert.equal(error.constructor, nativeError.constructor)
}
target.removeEventListener('actual', listener)
dom?.window.close()
console.log(
  JSON.stringify({
    realm,
    allNativeListenerControlsPassed: true,
    originalRealmAndErrorBrandsRetained: true,
  })
)
