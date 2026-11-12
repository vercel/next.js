const assert = require('node:assert/strict')
const primitivePath = require.resolve(
  'next/dist/experimental/testing/primitives/error'
)
const primitive = require(primitivePath)
let current
let shapeChecks = 0
require.cache[primitivePath].exports = {
  ...primitive,
  processTaskError(cloned, copies) {
    assert.deepEqual(
      Reflect.ownKeys(cloned),
      Reflect.ownKeys(current.raw),
      'own descriptor order'
    )
    assert.equal(
      Object.getPrototypeOf(cloned),
      Object.getPrototypeOf(current.raw),
      'original prototype'
    )
    const method = Object.getOwnPropertyDescriptor(current.raw, 'method')
    if (method)
      assert.equal(
        cloned.method,
        method.value,
        'ordinary method data is not bound'
      )
    const cause = Object.getOwnPropertyDescriptor(current.raw, 'cause')
    if (cause?.value === current.raw)
      assert.equal(cloned.cause, cloned, 'self cause uses final identity')
    const extra = Object.getOwnPropertyDescriptor(current.raw, 'extra')
    if (extra?.value === current.raw)
      assert.equal(cloned.extra, cloned, 'direct self data uses final identity')
    assert.equal(copies.get(current.raw), cloned, 'actual copied identity')
    shapeChecks++
    return primitive.processTaskError(cloned, copies)
  },
}
const {
  serializeTaskError,
} = require('next/dist/experimental/testing/runner/tasks')
function plain(stack) {
  const raw = new Error('native receiver')
  raw.stack = arguments.length ? stack : ''
  return { raw, reads: [], writes: [], state: () => ({}) }
}
function getter(kind = 'own', throwing, withSetter = false) {
  const raw = new Error(),
    store = new WeakMap([
      [raw, { name: 'GetterName', message: 'getter message' }],
    ]),
    reads = [],
    writes = []
  raw.stack = ''
  const proto = Object.create(Error.prototype)
  if (kind === 'inherited') Object.setPrototypeOf(raw, proto)
  for (const key of ['name', 'message'])
    Object.defineProperty(kind === 'inherited' ? proto : raw, key, {
      configurable: true,
      get() {
        reads.push({ key, originalReceiver: this === raw })
        if (throwing === 'undefined') throw undefined
        if (throwing === 'error') throw new Error('authored getter failure')
        if (!store.has(this)) throw new Error('foreign getter receiver')
        return store.get(this)[key]
      },
      ...(withSetter
        ? {
            set(next) {
              writes.push({ key, originalReceiver: this === raw })
              const prior = store.get(this) ?? {}
              store.set(this, { ...prior, [key]: next })
            },
          }
        : {}),
    })
  return { raw, reads, writes, state: () => store.get(raw) }
}
function weakStack(value = 'before write', prefix = '', weakDiff = false) {
  const raw = new Error('weak receiver'),
    store = new WeakMap([[raw, value]]),
    diffs = new WeakMap(),
    reads = [],
    writes = []
  Object.defineProperty(raw, 'stack', {
    configurable: true,
    get() {
      reads.push({ key: 'stack', originalReceiver: this === raw })
      if (!store.has(this)) throw new Error('foreign stack receiver')
      return store.get(this)
    },
    set(next) {
      writes.push({ key: 'stack', originalReceiver: this === raw })
      store.set(this, next)
    },
  })
  if (prefix !== null) {
    raw.showDiff = true
    raw.actual = 1
    raw.expected = 2
    Object.defineProperty(raw, 'diff', {
      configurable: true,
      enumerable: true,
      get() {
        reads.push({ key: 'diff', originalReceiver: this === raw })
        return weakDiff ? diffs.get(this) : this.savedDiff
      },
      set(next) {
        writes.push({ key: 'diff', originalReceiver: this === raw })
        if (weakDiff) diffs.set(this, prefix + next)
        else this.savedDiff = prefix + next
        this.stack = 'clone-local stack'
      },
    })
  }
  return {
    raw,
    reads,
    writes,
    state: () => ({ stack: store.get(raw), diff: diffs.get(raw) }),
  }
}
function inheritedScalarWrites() {
  const value = getter('inherited', undefined, true)
  const raw = value.raw
  const stacks = new WeakMap([[raw, 'before inherited write']])
  delete raw.stack
  Object.defineProperty(Object.getPrototypeOf(raw), 'stack', {
    configurable: true,
    get() {
      value.reads.push({ key: 'stack', originalReceiver: this === raw })
      return stacks.get(this)
    },
    set(next) {
      value.writes.push({ key: 'stack', originalReceiver: this === raw })
      stacks.set(this, next)
    },
  })
  raw.showDiff = true
  raw.actual = 1
  raw.expected = 2
  Object.defineProperty(raw, 'diff', {
    configurable: true,
    get() {
      return this.savedDiff
    },
    set(next) {
      this.name = 'InheritedWrittenName'
      this.message = 'inherited written message'
      this.stack = 'inherited written stack'
      this.savedDiff = next
    },
  })
  return value
}
function dynamic() {
  const raw = new Error(),
    reads = [],
    writes = []
  raw.stack = ''
  Object.defineProperty(raw, 'name', {
    configurable: true,
    get() {
      reads.push({ key: 'name', originalReceiver: this === raw })
      Object.defineProperty(raw, 'message', {
        configurable: true,
        get() {
          reads.push({ key: 'new-message', originalReceiver: this === raw })
          return 'new message'
        },
      })
      return 'DynamicName'
    },
  })
  Object.defineProperty(raw, 'message', {
    configurable: true,
    get() {
      reads.push({ key: 'old-message', originalReceiver: this === raw })
      return 'old message'
    },
  })
  return { raw, reads, writes, state: () => ({}) }
}
function symbols() {
  const x = getter(),
    privateKey = Symbol('private'),
    raw = x.raw
  Object.defineProperty(raw, privateKey, {
    configurable: true,
    enumerable: true,
    get() {
      x.reads.push({ key: 'symbol', originalReceiver: this === raw })
      return 123
    },
  })
  Object.defineProperty(raw, Symbol.toStringTag, {
    configurable: true,
    get() {
      x.reads.push({ key: 'tag', originalReceiver: this === raw })
      return 'Error'
    },
  })
  raw.method = function ordinaryMethod() {}
  return x
}
function cycle(kind) {
  const x = plain(),
    raw = x.raw
  if (kind === 'cause-self') raw.cause = raw
  if (kind === 'cause-pair') {
    const other = new Error('inner')
    other.stack = ''
    raw.cause = other
    other.cause = raw
  }
  if (kind === 'extra-self') raw.extra = raw
  if (kind === 'shared-data') {
    const shared = { value: 1 }
    shared.self = shared
    raw.left = shared
    raw.right = shared
  }
  return x
}
const cases = [
  ['native-empty', () => plain('')],
  [
    'native-nonempty',
    () => plain('Error: stable\n at authored (/fixture.js:1:2)'),
  ],
  ['native-undefined', () => plain(undefined)],
  ['own-readonly', () => getter()],
  ['inherited-readonly', () => getter('inherited')],
  ['own-untouched-setter', () => getter('own', undefined, true)],
  ['inherited-untouched-setter', () => getter('inherited', undefined, true)],
  ['own-throw-undefined', () => getter('own', 'undefined')],
  ['inherited-throw-error', () => getter('inherited', 'error')],
  ['weak-stack', () => weakStack('', null)],
  ['diff-setter', () => weakStack()],
  ['diff-prefix-setter', () => weakStack('before write', 'prefix:')],
  ['diff-weak-prefix-setter', () => weakStack('before write', 'prefix:', true)],
  ['diff-inherited-scalars', inheritedScalarWrites],
  ['descriptor-mutation', dynamic],
  ['symbol-and-method', symbols],
  ...['cause-self', 'cause-pair', 'extra-self', 'shared-data'].map((mode) => [
    mode,
    () => cycle(mode),
  ]),
]

function stackMutation() {
  const raw = new Error(),
    reads = [],
    writes = []
  Object.defineProperty(raw, 'stack', {
    configurable: true,
    get() {
      reads.push({ key: 'stack', originalReceiver: this === raw })
      Object.defineProperty(raw, 'stack', {
        configurable: true,
        writable: true,
        value: 'second stack',
      })
      return 'first stack'
    },
  })
  Object.defineProperty(raw, 'message', {
    configurable: true,
    get() {
      reads.push({ key: 'message', originalReceiver: this === raw })
      return 'stack now ' + this.stack
    },
  })
  return { raw, reads, writes, state: () => ({}) }
}
cases.push(['stack-descriptor-mutation', stackMutation])
let compared = 0
for (const [name, make] of cases) {
  const reference = make(),
    actual = make()
  const descriptors = Object.getOwnPropertyDescriptors(actual.raw)
  const proto = Object.getPrototypeOf(actual.raw)
  const expected = primitive.processError(reference.raw)
  current = actual
  const result = serializeTaskError(actual.raw)
  assert.deepEqual(result, expected, name + ' exact pinned output')
  assert.deepEqual(
    actual.reads.map((row) => row.key),
    reference.reads.map((row) => row.key),
    name + ' getter read count/order'
  )
  if (!name.startsWith('diff-'))
    assert.deepEqual(actual.reads, reference.reads, name + ' getter receivers')
  // Generic setters keep their existing clone-local computations. The three
  // post-setter getter receiver traces remain separately unqualified.
  assert(
    actual.writes.every((row) => !row.originalReceiver),
    name + ' setter receiver stays local'
  )
  assert.equal(
    Object.getPrototypeOf(actual.raw),
    proto,
    name + ' raw prototype'
  )
  assert.deepEqual(
    Reflect.ownKeys(actual.raw),
    Reflect.ownKeys(descriptors),
    name + ' raw own keys'
  )
  if (!['descriptor-mutation', 'stack-descriptor-mutation'].includes(name))
    for (const key of Reflect.ownKeys(descriptors))
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(actual.raw, key),
        descriptors[key],
        name + ' raw descriptor/data ' + String(key)
      )
  else
    assert.deepEqual(
      actual.state(),
      reference.state(),
      name + ' authored mutation state'
    )
  if (name === 'stack-descriptor-mutation')
    assert.equal(actual.raw.stack, reference.raw.stack)
  compared++
}
const reference = getter('inherited'),
  actual = getter('inherited')
const expected = primitive.processError(reference.raw)
const saved = {
  apply: Reflect.apply,
  get: Reflect.get,
  set: Reflect.set,
  Proxy: globalThis.Proxy,
  Set: globalThis.Set,
}
current = actual
try {
  Reflect.apply = () => {
    throw new Error('authored Reflect.apply replacement')
  }
  Reflect.get = () => {
    throw new Error('authored Reflect.get replacement')
  }
  Reflect.set = () => {
    throw new Error('authored Reflect.set replacement')
  }
  globalThis.Proxy = function () {
    throw new Error('authored Proxy replacement')
  }
  globalThis.Set = function () {
    throw new Error('authored Set replacement')
  }
  assert.deepEqual(serializeTaskError(actual.raw), expected)
} finally {
  Reflect.apply = saved.apply
  Reflect.get = saved.get
  Reflect.set = saved.set
  globalThis.Proxy = saved.Proxy
  globalThis.Set = saved.Set
}
assert.deepEqual(actual.reads, reference.reads)
assert.equal(compared, 21)
assert.equal(shapeChecks, compared + 1)
process.stdout.write(
  JSON.stringify({
    comparisons: compared + 1,
    untouchedOwnAndInheritedGetterReceivers: true,
    exactReadCountOrderAndThrowUndefined: true,
    ordinaryMethodDataPrototypeAndKeyOrder: true,
    nativeStackAndDescriptorMutation: true,
    setterWritesStayLocal: true,
    directSelfAndCauseCycles: true,
    capturedNewIntrinsics: true,
    postSetterGetterReceiverParityNotClaimed: true,
  }) + '\n'
)
