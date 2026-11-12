const assert = require('node:assert/strict')
const {
  processError,
} = require('next/dist/compiled/next-test-primitives/error')
const {
  serializeTaskError,
} = require('next/dist/experimental/testing/runner/tasks')
const cases = []
for (const key of ['self', 'name', 'message'])
  for (const nested of [false, true])
    for (const inherited of [false, true])
      cases.push([
        `${key}-${nested ? 'nested' : 'direct'}-${inherited ? 'inherited' : 'own'}`,
        () => {
          const raw = new Error(),
            reads = []
          raw.stack = ''
          const proto = Object.create(Error.prototype)
          if (inherited) Object.setPrototypeOf(raw, proto)
          Object.defineProperty(inherited ? proto : raw, key, {
            configurable: true,
            get() {
              reads.push({ key, originalReceiver: this === raw })
              return nested ? { owner: this } : this
            },
          })
          return { raw, reads }
        },
      ])
for (const kind of [
  'undefined',
  'symbol',
  'null-cause',
  'array-shared',
  'toJSON-error',
  'toJSON-undefined',
  'throwing-name-undefined',
])
  cases.push([
    kind,
    () => {
      const reads = []
      if (kind === 'undefined') return { raw: undefined, reads }
      if (kind === 'symbol') return { raw: Symbol.for('authored-error'), reads }
      const raw = new Error('stable fallback')
      raw.stack = ''
      if (kind === 'null-cause') raw.cause = null
      if (kind === 'array-shared') {
        raw.payload = [raw, raw]
        raw.payload.push(raw.payload)
      }
      if (kind === 'toJSON-error' || kind === 'toJSON-undefined')
        Object.defineProperty(raw, 'toJSON', {
          configurable: true,
          get() {
            reads.push({ key: 'toJSON', originalReceiver: this === raw })
            if (kind === 'toJSON-error')
              throw new Error('serialization fallback')
            throw undefined
          },
        })
      if (kind === 'throwing-name-undefined')
        Object.defineProperty(raw, 'name', {
          configurable: true,
          get() {
            reads.push({ key: 'name', originalReceiver: this === raw })
            throw undefined
          },
        })
      return { raw, reads }
    },
  ])
function run(serialize, raw) {
  // The same authored formatter makes newly-created fallback stacks comparable.
  // It is restored for every call; native stack preservation has separate probes.
  const descriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  Object.defineProperty(Error, 'prepareStackTrace', {
    configurable: true,
    writable: true,
    value: () => '',
  })
  try {
    try {
      return { kind: 'returned', value: serialize(raw) }
    } catch (error) {
      return { kind: 'threw', value: error }
    }
  } finally {
    if (descriptor)
      Object.defineProperty(Error, 'prepareStackTrace', descriptor)
    else delete Error.prepareStackTrace
  }
}
for (const [name, make] of cases) {
  const reference = make(),
    actual = make()
  const descriptors =
    actual.raw && typeof actual.raw === 'object'
      ? Object.getOwnPropertyDescriptors(actual.raw)
      : undefined
  const expected = run(processError, reference.raw)
  const result = run(serializeTaskError, actual.raw)
  assert.deepEqual(result, expected, name + ' whole pinned output')
  assert.deepEqual(
    actual.reads.map((row) => row.key),
    reference.reads.map((row) => row.key),
    name + ' exact getter count/order'
  )
  if (name.startsWith('self-') || name.startsWith('toJSON-'))
    assert(
      actual.reads.every((row) => !row.originalReceiver),
      name + ' ordinary accessor retains clone receiver'
    )
  else
    assert.deepEqual(
      actual.reads,
      reference.reads,
      name + ' scalar getter receiver'
    )
  if (descriptors) {
    assert.deepEqual(
      Reflect.ownKeys(actual.raw),
      Reflect.ownKeys(descriptors),
      name + ' raw own keys/order'
    )
    for (const key of Reflect.ownKeys(descriptors))
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(actual.raw, key),
        descriptors[key],
        name + ' original descriptor/data ' + String(key)
      )
  }
}
assert.equal(cases.length, 19)
process.stdout.write(
  JSON.stringify({
    comparisons: cases.length,
    selfAndNestedAliases: 12,
    scalarReceiversAndExactGetterCounts: true,
    ordinaryAccessorReceiversRetained: true,
    primitivesNullCauseAndSharedArray: true,
    fallbackAndThrowUndefined: true,
    originalDescriptorsAndDataHeld: true,
    publicProcessErrorUnchanged: true,
  }) + '\n'
)
