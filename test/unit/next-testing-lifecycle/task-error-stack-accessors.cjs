const assert = require('node:assert/strict')
const {
  processError,
} = require('next/dist/compiled/next-test-primitives/error')
const {
  serializeTaskError,
} = require('next/dist/experimental/testing/runner/tasks')
function native(value) {
  const raw = new Error('native receiver')
  raw.stack = value
  return {
    raw,
    metrics: { reads: 0, writes: 0, receivers: [] },
    state: () => value,
  }
}
function weak(value) {
  const raw = new Error('weak receiver'),
    store = new WeakMap([[raw, value]]),
    metrics = { reads: 0, writes: 0, receivers: [] }
  Object.defineProperty(raw, 'stack', {
    configurable: true,
    get() {
      metrics.reads++
      metrics.receivers.push(this === raw)
      if (!store.has(this)) throw new Error('foreign stack receiver')
      return store.get(this)
    },
    set(next) {
      metrics.writes++
      store.set(this, next)
    },
  })
  return { raw, metrics, state: () => store.get(raw) }
}
function throwing() {
  const raw = new Error('throwing getter'),
    metrics = { reads: 0, writes: 0, receivers: [] }
  Object.defineProperty(raw, 'stack', {
    configurable: true,
    get() {
      metrics.reads++
      metrics.receivers.push(this === raw)
      throw new Error(
        this === raw ? 'original getter failure' : 'foreign getter failure'
      )
    },
  })
  return { raw, metrics, state: () => undefined }
}
function written() {
  const result = weak('before write'),
    raw = result.raw
  raw.showDiff = true
  raw.actual = 1
  raw.expected = 2
  Object.defineProperty(raw, 'diff', {
    configurable: true,
    enumerable: true,
    get() {
      return this.savedDiff
    },
    set(next) {
      this.savedDiff = next
      this.stack = 'clone-local stack'
    },
  })
  return result
}

const cases = [
  ...['', 'Error: stable\n at authored (/fixture.js:1:2)', undefined].map(
    (value, index) => ['native-' + index, () => native(value)]
  ),
  ...['', 'custom stack', undefined].map((value, index) => [
    'weak-' + index,
    () => weak(value),
  ]),
  ['throwing', throwing],
  ['setter-isolation', written],
]
let compared = 0
for (const [name, make] of cases) {
  const reference = make(),
    actual = make(),
    descriptors = Object.getOwnPropertyDescriptors(actual.raw)
  const expected = processError(reference.raw),
    result = serializeTaskError(actual.raw)
  assert.deepEqual(result, expected, name)
  assert.equal(
    actual.metrics.reads,
    reference.metrics.reads,
    name + ' getter reads'
  )
  assert(
    actual.metrics.receivers.every(Boolean),
    name + ' original getter receiver'
  )
  assert.equal(actual.metrics.writes, 0, name + ' original setter isolation')
  assert.equal(
    actual.state(),
    name === 'setter-isolation' ? 'before write' : make().state(),
    name + ' original backing state'
  )
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(actual.raw),
    descriptors,
    name + ' original descriptors and values'
  )
  if (name === 'setter-isolation') assert.equal(reference.metrics.writes, 1)
  compared++
}
const nativeError = new Error('outer', { cause: new Error('inner') })
nativeError.stack = 'outer stack'
nativeError.cause.stack = ''
const referenceError = new Error('outer', { cause: new Error('inner') })
referenceError.stack = 'outer stack'
referenceError.cause.stack = ''
const originalCause = nativeError.cause
assert.deepEqual(serializeTaskError(nativeError), processError(referenceError))
assert.equal(nativeError.cause, originalCause)
assert.equal(originalCause.stack, '')
const apply = Reflect.apply,
  guarded = weak('intrinsic receiver'),
  expected = processError(weak('intrinsic receiver').raw)
try {
  Reflect.apply = () => {
    throw new Error('authored Reflect.apply replacement')
  }
  assert.deepEqual(serializeTaskError(guarded.raw), expected)
} finally {
  Reflect.apply = apply
}
assert.equal(guarded.metrics.reads, 1)
assert(guarded.metrics.receivers.every(Boolean))
process.stdout.write(
  JSON.stringify({
    comparisons: compared + 2,
    nativeEmptyNonemptyUndefined: true,
    originalGetterReceiverAndReadCounts: true,
    weakMapAndThrowingGetters: true,
    serializerWritesStayLocal: true,
    originalDescriptorsValuesAndCausePreserved: true,
    capturedAccessorInvocation: true,
  }) + '\n'
)
