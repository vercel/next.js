const assert = require('node:assert/strict')
const path = require('node:path')
async function main() {
  const root = process.argv[2]
  const mode = process.argv[3]
  const {
    registerVitestAssertionTaskRuntime: register,
    getVitestAssertionTaskRuntime: runtime,
    recordAsyncExpect,
  } = require(
    path.join(
      root,
      'packages/next/dist/compiled/next-test-primitives',
      mode === 'browser' ? 'browser/index.js' : 'index.js'
    )
  )
  const carrier = () => ({
    type: 'test',
    fullTestName: 'actual private attempt',
    promises: [],
    onFinished: [],
    result: { state: 'run', errors: [] },
  })
  const deferred = () => {
    let resolve, reject
    const promise = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    return { promise, resolve, reject }
  }
  const observer = (owner, trace = []) => ({
    recorded(promise) {
      trace.push('recorded')
      owner.promises.push(promise)
    },
    settled(promise) {
      trace.push('settled')
      const index = owner.promises.indexOf(promise)
      if (index !== -1) owner.promises.splice(index, 1)
    },
  })
  const checks = []
  for (const outcome of ['fulfilled', 'rejected', 'soft']) {
    const actual = { type: 'test' },
      previous = carrier(),
      next = carrier(),
      trace = [],
      nextTrace = [],
      work = deferred(),
      reason = new Error('actual original native rejection')
    register(actual, previous, observer(previous, trace))
    const pending = recordAsyncExpect(
      actual,
      work.promise,
      'expect(actual).controlled()',
      new Error('actual origin'),
      outcome === 'soft'
    )
    const queue = actual.promises,
      recorded = queue[0]
    assert.notEqual(pending, recorded)
    assert(recorded instanceof Promise)
    assert.equal(previous.promises[0], recorded)
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'promises'), {
      value: queue,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    assert.equal(Object.getPrototypeOf(queue), Array.prototype)
    assert.equal(Object.hasOwn(queue, 'push'), false)
    assert.equal(Object.hasOwn(actual, 'onFinished'), false)
    assert.equal(previous.onFinished.length, 1)
    register(actual, next, observer(next, nextTrace))
    assert.equal(runtime(actual), next)
    const observed = Promise.resolve(pending)
    const checked =
      outcome === 'rejected'
        ? assert.rejects(observed, (error) => error === reason)
        : observed
    if (outcome === 'fulfilled') work.resolve(17)
    else work.reject(reason)
    const value = await checked
    if (outcome === 'fulfilled') assert.equal(value, 17)
    assert.equal(actual.promises, queue)
    assert.equal(queue.length, 0)
    assert.equal(previous.promises.length, 0)
    assert.equal(next.promises.length, 0)
    assert.deepEqual(trace, ['recorded', 'settled'])
    assert.deepEqual(nextTrace, [])
    assert.equal(next.onFinished.length, 0)
    assert.equal(next.result.state, 'run')
    previous.onFinished[0]()
    if (outcome === 'soft') {
      assert.equal(previous.result.state, 'fail')
      assert.equal(previous.result.errors.length, 1)
      assert.equal(previous.result.errors[0].message, reason.message)
    } else assert.deepEqual(previous.result, { state: 'run', errors: [] })
    checks.push(
      outcome +
        ': exact native/plain public queue and captured previous attempt'
    )
  }
  {
    const actual = { type: 'test' },
      owner = carrier(),
      work = deferred(),
      trace = [],
      queue = []
    queue.push = function (promise) {
      assert.equal(this, queue)
      trace.push('push')
      return Array.prototype.push.call(this, promise)
    }
    queue.indexOf = function (promise) {
      assert.equal(this, queue)
      trace.push('indexOf')
      return Array.prototype.indexOf.call(this, promise)
    }
    queue.splice = function (...args) {
      assert.equal(this, queue)
      trace.push('splice')
      return Array.prototype.splice.apply(this, args)
    }
    Object.defineProperty(actual, 'promises', {
      configurable: true,
      get() {
        trace.push('get')
        return queue
      },
    })
    register(actual, owner, observer(owner, trace))
    const pending = recordAsyncExpect(
      actual,
      work.promise,
      'expect(actual).controlled()',
      new Error('actual origin')
    )
    assert.deepEqual(trace, ['get', 'get', 'push', 'recorded'])
    work.resolve(19)
    assert.equal(await pending, 19)
    assert.deepEqual(trace, [
      'get',
      'get',
      'push',
      'recorded',
      'get',
      'get',
      'indexOf',
      'get',
      'splice',
      'settled',
    ])
    assert.equal(owner.promises.length, 0)
    checks.push(
      'exact actual getter/push/indexOf/splice ordering and receivers'
    )
  }
  {
    const actual = { type: 'test' },
      previous = carrier(),
      next = carrier(),
      trace = [],
      nextTrace = [],
      queue = [],
      work = deferred()
    register(actual, previous, observer(previous, trace))
    Object.defineProperty(actual, 'promises', {
      configurable: true,
      get() {
        register(actual, next, observer(next, nextTrace))
        return queue
      },
    })
    const pending = recordAsyncExpect(
      actual,
      work.promise,
      'expect(actual).controlled()',
      new Error('actual origin')
    )
    assert.equal(runtime(actual), next)
    assert.equal(previous.promises[0], queue[0])
    work.resolve(23)
    assert.equal(await pending, 23)
    assert.deepEqual(trace, ['recorded', 'settled'])
    assert.deepEqual(nextTrace, [])
    assert.equal(previous.promises.length, 0)
    checks.push(
      'capture entry once before authored public getter rebinds actual Test'
    )
  }
  for (const fault of ['getter', 'indexOf', 'splice']) {
    const actual = { type: 'test' },
      owner = carrier(),
      work = deferred(),
      trace = [],
      queue = [],
      reason = new Error('actual public ' + fault + ' rejection')
    let cleanup = false
    Object.defineProperty(actual, 'promises', {
      configurable: true,
      get() {
        if (cleanup && fault === 'getter') throw reason
        return queue
      },
    })
    if (fault !== 'getter')
      queue[fault] = function () {
        throw reason
      }
    register(actual, owner, observer(owner, trace))
    const pending = recordAsyncExpect(
      actual,
      work.promise,
      'expect(actual).controlled()',
      new Error('actual origin')
    )
    const native = queue[0],
      checked = assert.rejects(
        Promise.resolve(pending),
        (error) => error === reason
      )
    cleanup = true
    work.resolve(29)
    await checked
    assert.equal(queue[0], native)
    assert.equal(queue.length, 1)
    assert.equal(owner.promises.length, 0)
    assert.deepEqual(trace, ['recorded', 'settled'])
    owner.onFinished[0]()
    checks.push(
      'actual public ' +
        fault +
        ' error identity with private settlement in finally'
    )
  }
  for (const storesFirst of [false, true]) {
    const actual = { type: 'test' },
      owner = carrier(),
      trace = [],
      queue = [],
      work = deferred(),
      reason = new Error('actual public push error')
    let native
    queue.push = function (promise) {
      native = promise
      if (storesFirst) Array.prototype.push.call(this, promise)
      throw reason
    }
    actual.promises = queue
    register(actual, owner, observer(owner, trace))
    assert.throws(
      () =>
        recordAsyncExpect(
          actual,
          work.promise,
          'expect(actual).controlled()',
          new Error('actual origin')
        ),
      (error) => error === reason
    )
    assert.equal(owner.promises.length, 0)
    assert.deepEqual(trace, [])
    assert(native instanceof Promise)
    const checked = Promise.resolve(native)
    work.resolve(31)
    assert.equal(await checked, 31)
    assert.equal(queue.length, 0)
    assert.deepEqual(trace, ['settled'])
    checks.push(
      'authored push throw remains exact, storesBeforeThrow=' + storesFirst
    )
  }
  {
    const actual = { type: 'test' },
      owner = carrier(),
      trace = [],
      work = deferred(),
      reason = new Error('actual private finished push error')
    owner.onFinished.push = function () {
      throw reason
    }
    register(actual, owner, observer(owner, trace))
    assert.throws(
      () =>
        recordAsyncExpect(
          actual,
          work.promise,
          'expect(actual).controlled()',
          new Error('actual origin')
        ),
      (error) => error === reason
    )
    const native = actual.promises[0]
    assert.equal(owner.promises[0], native)
    const checked = Promise.resolve(native)
    work.resolve(37)
    assert.equal(await checked, 37)
    assert.equal(actual.promises.length, 0)
    assert.equal(owner.promises.length, 0)
    assert.deepEqual(trace, ['recorded', 'settled'])
    checks.push(
      'existing onFinished failure leaves recorded actual Promise fully observed'
    )
  }
  process.stdout.write(
    JSON.stringify({ mode, controls: checks.length, checks }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
