const assert = require('node:assert/strict')
const mode = process.argv[2],
  primitive = require(process.argv[3]),
  rows = [],
  failures = []
const {
  registerVitestAssertionTaskRuntime: register,
  getVitestAssertionTaskRuntime: runtime,
  recordAsyncExpect: record,
} = primitive
const carrier = () => ({
  type: 'test',
  promises: [],
  onFinished: [],
  result: { state: 'run', errors: [] },
})
const deferred = () => {
  let resolve, reject
  return {
    promise: new Promise((yes, no) => {
      resolve = yes
      reject = no
    }),
    resolve,
    reject,
  }
}
const observe = (owner, trace = []) => ({
  checks: [],
  recorded(promise) {
    owner.promises.push(promise)
    trace.push('recorded')
  },
  settled(promise) {
    const i = owner.promises.indexOf(promise)
    if (i !== -1) owner.promises.splice(i, 1)
    trace.push('settled')
  },
  finished(promise, check) {
    assert.equal(this, observerReceivers.get(this))
    this.checks.push({ promise, check })
    trace.push('finished')
  },
})
const observerReceivers = new WeakMap()
const observer = (owner, trace) => {
  const value = observe(owner, trace)
  observerReceivers.set(value, value)
  return value
}
const origin = () =>
  Object.assign(new Error('actual native origin'), { stack: '' })
async function check(name, fn) {
  try {
    await fn()
    rows.push({ name, passed: true })
  } catch (error) {
    rows.push({ name, passed: false, message: error.message })
    failures.push(error)
  }
}
;(async () => {
  for (const outcome of ['fulfilled', 'rejected', 'soft'])
    await check(
      outcome +
        ': exact public anonymous callback/Promise and old captured owner',
      async () => {
        const actual = { type: 'test' },
          old = carrier(),
          next = carrier(),
          trace = [],
          oldObserver = observer(old, trace),
          newObserver = observer(next, []),
          work = deferred(),
          reason = new Error('actual rejection')
        register(actual, old, oldObserver)
        const pending = record(
            actual,
            work.promise,
            'expect(actual).controlled()',
            origin(),
            outcome === 'soft'
          ),
          native = actual.promises[0],
          callback = actual.onFinished[0]
        assert(native instanceof Promise)
        assert.notEqual(native, pending)
        assert.equal(oldObserver.checks[0].promise, native)
        assert.equal(oldObserver.checks[0].check, callback)
        assert.equal(callback.name, '')
        assert.equal(callback.length, 0)
        assert.equal(Object.hasOwn(callback, 'prototype'), false)
        assert.equal(Object.getPrototypeOf(actual.onFinished), Array.prototype)
        assert.equal(Object.hasOwn(actual.onFinished, 'push'), false)
        assert.deepEqual(
          Object.getOwnPropertyDescriptor(actual, 'onFinished'),
          {
            value: actual.onFinished,
            writable: true,
            enumerable: true,
            configurable: true,
          }
        )
        assert.equal(old.onFinished.length, 0)
        assert.notEqual(actual.onFinished, old.onFinished)
        register(actual, next, newObserver)
        assert.equal(runtime(actual), next)
        const consumed = Promise.resolve(pending),
          settled =
            outcome === 'rejected'
              ? assert.rejects(consumed, (error) => error === reason)
              : consumed
        if (outcome === 'fulfilled') work.resolve(17)
        else work.reject(reason)
        await settled
        callback()
        assert.deepEqual(trace, ['recorded', 'finished', 'settled'])
        assert.equal(old.promises.length, 0)
        assert.equal(newObserver.checks.length, 0)
        assert.equal(next.result.state, 'run')
        if (outcome === 'soft')
          assert.equal(old.result.errors[0].message, reason.message)
      }
    )
  await check(
    'authored finished field/push getters and exact receivers',
    async () => {
      const actual = { type: 'test', promises: [] },
        owner = carrier(),
        trace = [],
        o = observer(owner, trace),
        queue = [],
        work = deferred()
      let gets = 0
      Object.defineProperty(o, 'finished', {
        get() {
          trace.push('observer-get')
          return function (promise, callback) {
            assert.equal(this, o)
            this.checks.push({ promise, check: callback })
            trace.push('finished')
          }
        },
      })
      Object.defineProperty(actual, 'onFinished', {
        get() {
          trace.push('field-get' + ++gets)
          return queue
        },
      })
      Object.defineProperty(queue, 'push', {
        get() {
          trace.push('push-get')
          return function (callback) {
            assert.equal(this, queue)
            assert.equal(callback, o.checks[0].check)
            trace.push('push')
            return Array.prototype.push.call(this, callback)
          }
        },
      })
      register(actual, owner, o)
      const pending = record(
        actual,
        work.promise,
        'expect(actual).controlled()',
        origin()
      )
      assert.deepEqual(trace, [
        'observer-get',
        'recorded',
        'field-get1',
        'field-get2',
        'push-get',
        'finished',
        'push',
      ])
      const consumed = Promise.resolve(pending)
      work.resolve(19)
      await consumed
      queue[0]()
      assert.equal(owner.promises.length, 0)
    }
  )
  await check(
    'capture original finished observer before authored getter rebind/mutation',
    async () => {
      const actual = { type: 'test' },
        owner = carrier(),
        next = carrier(),
        old = observer(owner, []),
        fresh = observer(next, []),
        queue = [],
        work = deferred()
      register(actual, owner, old)
      Object.defineProperty(actual, 'onFinished', {
        get() {
          register(actual, next, fresh)
          old.finished = () => {
            throw Error('must keep original callable')
          }
          return queue
        },
      })
      const pending = record(
        actual,
        work.promise,
        'expect(actual).controlled()',
        origin()
      )
      assert.equal(runtime(actual), next)
      assert.equal(old.checks[0].check, queue[0])
      assert.equal(fresh.checks.length, 0)
      const consumed = Promise.resolve(pending)
      work.resolve(23)
      await consumed
      queue[0]()
    }
  )
  await check(
    'nullish actual initialization creates one real ordinary array',
    async () => {
      const actual = { type: 'test' },
        owner = carrier(),
        trace = [],
        o = observer(owner, trace),
        work = deferred()
      let value = null
      Object.defineProperty(actual, 'onFinished', {
        get() {
          trace.push('get')
          return value
        },
        set(next) {
          trace.push('set')
          value = next
        },
      })
      register(actual, owner, o)
      const pending = record(
        actual,
        work.promise,
        'expect(actual).controlled()',
        origin()
      )
      assert.deepEqual(trace, ['recorded', 'get', 'set', 'get', 'finished'])
      assert.equal(Object.getPrototypeOf(value), Array.prototype)
      assert.equal(Object.hasOwn(value, 'push'), false)
      assert.equal(value[0], o.checks[0].check)
      const consumed = Promise.resolve(pending)
      work.resolve(29)
      await consumed
      value[0]()
    }
  )
  for (const failAt of [1, 2])
    await check(
      'actual finished getter throw ' +
        failAt +
        ' preserves identity and native settlement',
      async () => {
        const actual = { type: 'test' },
          owner = carrier(),
          o = observer(owner, []),
          queue = [],
          work = deferred(),
          reason = new Error('actual getter failure')
        let count = 0
        Object.defineProperty(actual, 'onFinished', {
          get() {
            if (++count === failAt) throw reason
            return queue
          },
        })
        register(actual, owner, o)
        assert.throws(
          () =>
            record(
              actual,
              work.promise,
              'expect(actual).controlled()',
              origin()
            ),
          (error) => error === reason
        )
        assert.equal(o.checks.length, 0)
        const native = actual.promises[0],
          consumed = Promise.resolve(native)
        work.resolve(31)
        await consumed
        assert.equal(owner.promises.length, 0)
      }
    )
  for (const stores of [false, true])
    await check(
      'actual finished push throw storesBeforeThrow=' +
        stores +
        ' captures exact check without aliasing',
      async () => {
        const actual = { type: 'test', onFinished: [] },
          owner = carrier(),
          o = observer(owner, []),
          work = deferred(),
          reason = new Error('actual push failure')
        let callback
        actual.onFinished.push = function (fn) {
          callback = fn
          if (stores) Array.prototype.push.call(this, fn)
          throw reason
        }
        register(actual, owner, o)
        assert.throws(
          () =>
            record(
              actual,
              work.promise,
              'expect(actual).controlled()',
              origin()
            ),
          (error) => error === reason
        )
        assert.equal(o.checks[0].check, callback)
        assert.equal(actual.onFinished.length, stores ? 1 : 0)
        assert.equal(owner.onFinished.length, 0)
        const consumed = Promise.resolve(actual.promises[0])
        work.resolve(37)
        await consumed
        assert.throws(callback, /Promise returned by/)
      }
    )
  await check(
    'false field preserves nullish initialization and native TypeError',
    async () => {
      const actual = { type: 'test', onFinished: false },
        owner = carrier(),
        o = observer(owner, []),
        work = deferred()
      register(actual, owner, o)
      let message
      assert.throws(
        () =>
          record(actual, work.promise, 'expect(actual).controlled()', origin()),
        (error) => {
          message = error.message
          return error instanceof TypeError
        }
      )
      assert.equal(actual.onFinished, false)
      assert.equal(o.checks.length, 1)
      const consumed = Promise.resolve(actual.promises[0])
      work.resolve(41)
      await consumed
      rows.push({
        name: 'invalid-field engine diagnostic',
        actualMessage: message,
        referenceMessage: 'test.onFinished.push is not a function',
        equal: message === 'test.onFinished.push is not a function',
        reportBoundary: true,
      })
    }
  )
  const result = {
    mode,
    controls: rows.filter((r) => r.passed !== undefined).length,
    rows,
    failures: failures.length,
  }
  process.stdout.write(JSON.stringify(result) + '\n')
  if (failures.length) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
