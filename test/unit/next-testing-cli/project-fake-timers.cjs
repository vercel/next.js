const assert = require('node:assert/strict'),
  path = require('node:path'),
  vm = require('node:vm'),
  { createRequire } = require('node:module'),
  v8 = require('node:v8')
const repo = path.resolve(__dirname, '../../..')
const next = process.argv[2] || path.join(repo, 'packages/next')
const actual = createRequire(path.join(next, 'package.json'))
const m = { exports: actual('./dist/experimental/testing/config-fake-timers') }
const prepare = m.exports.prepareProjectFakeTimers
let controls = 0
function make(steps) {
  const rows = [],
    timers = { toFake: ['Date', 'setTimeout', 'clearTimeout'] }
  let n = 0
  Object.defineProperty(timers, 'now', {
    enumerable: true,
    get() {
      rows.push(['now', this === timers, ++n])
      const step = steps[n - 1] ?? steps.at(-1)
      if (Object.hasOwn(step, 'throw')) throw step.throw
      return step.value
    },
  })
  const test = { environment: 'node', fakeTimers: timers },
    root = { test }
  return { root, test, timers, rows }
}
function capture(fn) {
  try {
    return { threw: false, value: fn() }
  } catch (reason) {
    return { threw: true, reason }
  }
}
const date = new Date(1700000000123)
for (const [first, second, kind] of [
  [undefined, date, 'date'],
  [date, undefined, 'undefined'],
  [0, date, 'date'],
  [{}, date, 'plain'],
  [date, { tag: 1 }, 'identity'],
]) {
  const f = make([{ value: first }, { value: second }]),
    before = Object.getOwnPropertyDescriptors(f.timers),
    out = prepare(f.root)
  assert.deepEqual(f.rows, [
    ['now', true, 1],
    ['now', true, 2],
  ])
  const value = out.test.fakeTimers.now
  if (kind === 'date' || kind === 'identity') assert.equal(value, second)
  if (kind === 'undefined') {
    assert(Object.hasOwn(out.test.fakeTimers, 'now'))
    assert.equal(value, undefined)
  }
  if (kind === 'plain') {
    assert.deepEqual(value, {})
    assert(!(value instanceof Date))
  }
  assert.equal(
    Object.getOwnPropertyDescriptor(f.timers, 'now').get,
    before.now.get
  )
  assert.equal(f.root.test, f.test)
  assert.equal(f.test.fakeTimers, f.timers)
  controls++
}
for (const reason of [
  undefined,
  null,
  { tag: 'same thrown object' },
  new Error('same Error'),
])
  for (const index of [0, 1]) {
    const steps = [{ value: date }, { value: date }]
    steps[index] = { throw: reason }
    const f = make(steps),
      out = capture(() => prepare(f.root))
    assert.equal(out.threw, true)
    assert.equal(out.reason, reason)
    assert.equal(f.rows.length, index + 1)
    controls++
  }
{
  const f = make([{ value: date }])
  let indices = 0,
    iterators = 0,
    toFake = 0,
    limit = 0
  const methods = ['Date', 'setTimeout', 'clearTimeout']
  Object.defineProperty(methods, 0, {
    get() {
      indices++
      return 'Date'
    },
  })
  Object.defineProperty(methods, Symbol.iterator, {
    value() {
      iterators++
      throw Error('not copied by iteration')
    },
  })
  Object.defineProperty(f.timers, 'toFake', {
    enumerable: true,
    get() {
      assert.equal(this, f.timers)
      toFake++
      return methods
    },
  })
  Object.defineProperty(f.timers, 'loopLimit', {
    enumerable: true,
    get() {
      assert.equal(this, f.timers)
      limit++
      return 10000
    },
  })
  const out = prepare(f.root)
  assert.equal(out.test.fakeTimers.toFake, methods)
  assert.equal(toFake, 2)
  assert.equal(limit, 2)
  assert.equal(indices, 0)
  assert.equal(iterators, 0)
  assert.deepEqual(Object.keys(out.test.fakeTimers), Object.keys(f.timers))
  controls++
}
for (const place of ['root', 'test']) {
  const f = make([{ value: date }])
  let reads = 0
  Object.defineProperty(f[place], 'unrelated', {
    enumerable: true,
    get() {
      assert.equal(this, f[place])
      reads++
      return 7
    },
  })
  assert.equal(prepare(f.root), f.root)
  assert.equal(reads, 0)
  assert.equal(f.rows.length, 0)
  v8.serialize(f.root)
  assert.equal(reads, 1)
  assert.equal(f.rows.length, 1)
  controls++
}
for (const place of ['root', 'test', 'timers']) {
  const f = make([{ value: date }])
  let traps = 0
  const proxy = new Proxy(f[place], {
    get() {
      traps++
      throw Error('trap')
    },
    getPrototypeOf() {
      traps++
      throw Error('trap')
    },
    ownKeys() {
      traps++
      throw Error('trap')
    },
  })
  if (place === 'root') f.root = proxy
  else if (place === 'test') f.root.test = proxy
  else f.test.fakeTimers = proxy
  assert.equal(prepare(f.root), f.root)
  assert.equal(traps, 0)
  assert.equal(f.rows.length, 0)
  controls++
}
for (const place of ['root', 'test', 'timers'])
  for (const key of ['constructor', Symbol.toStringTag]) {
    const f = make([{ value: date }])
    let reads = 0
    Object.defineProperty(f[place], key, {
      get() {
        reads++
        throw Error('classification hook')
      },
    })
    assert.equal(prepare(f.root), f.root)
    assert.equal(reads, 0)
    assert.equal(f.rows.length, 0)
    controls++
  }
for (const [key, value] of [
  ['projects', []],
  ['browser', {}],
  ['environment', 'jsdom'],
  ['isolate', false],
  ['route', {}],
  ['pool', 'threads'],
]) {
  const f = make([{ value: date }])
  f.test[key] = value
  assert.equal(prepare(f.root), f.root)
  assert.equal(f.rows.length, 0)
  controls++
}
for (const place of ['root', 'test']) {
  const f = make([{ value: date }]),
    key = place === 'root' ? 'test' : 'fakeTimers'
  let reads = 0
  Object.defineProperty(f[place], key, {
    enumerable: true,
    get() {
      reads++
      throw Error('container accessor')
    },
  })
  assert.equal(prepare(f.root), f.root)
  assert.equal(reads, 0)
  controls++
}
{
  const f = make([{ value: date }])
  assert.equal(prepare(f.root, true), f.root)
  assert.equal(f.rows.length, 0)
  controls++
}
{
  const f = make([{ value: date }])
  Object.freeze(f.timers)
  Object.freeze(f.test)
  Object.freeze(f.root)
  const out = prepare(f.root)
  assert.notEqual(out, f.root)
  assert.equal(out.test.fakeTimers.now, date)
  assert.equal(Object.getOwnPropertyDescriptor(out, 'test').writable, false)
  controls++
}
{
  const f = make([{ value: date }])
  f.root = vm.runInNewContext(
    '({test:{environment:"node",fakeTimers:{get now(){throw Error("foreign")}}}})'
  )
  assert.equal(prepare(f.root), f.root)
  controls++
}
for (const now of [undefined, 0, 42, date]) {
  const root = {
    test: { environment: 'node', fakeTimers: { now, toFake: ['Date'] } },
  }
  assert.equal(prepare(root), root)
  controls++
}
{
  const root = { test: { environment: 'node' } }
  const descriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator
  )
  let calls = 0
  Object.defineProperty(Array.prototype, Symbol.iterator, {
    ...descriptor,
    value: function () {
      calls++
      return Reflect.apply(descriptor.value, this, [])
    },
  })
  let out
  try {
    out = prepare(root)
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, descriptor)
  }
  assert.equal(out, root)
  assert.equal(calls, 0)
  controls++
}
{
  const value = new Date(1)
  let hooks = 0
  for (const key of ['getTime', 'toJSON', 'valueOf'])
    Object.defineProperty(value, key, {
      get() {
        hooks++
        throw Error('not a clock conversion')
      },
    })
  const f = make([{ value }])
  const out = prepare(f.root)
  assert.equal(out.test.fakeTimers.now, value)
  assert.equal(hooks, 0)
  controls++
}
const result = {
  controls,
  actualBuiltProducer: true,
  owningCopyOnly: true,
  originalReceiversAndThrownValues: true,
  undefinedPresenceRetained: true,
  arraysNotIterated: true,
  legacyUnrelatedAccessorsProxyHooksHeld: true,
}
console.log(JSON.stringify(result))
