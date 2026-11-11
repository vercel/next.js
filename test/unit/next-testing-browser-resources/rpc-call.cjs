'use strict'
const assert = require('node:assert/strict')
const NativePromise = Promise
const nativeThen = Promise.prototype.then
const nextTask = setImmediate
const {
  callClientRpc,
} = require('next/dist/experimental/testing/client/rpc-call')
const mode = process.argv[2]
const marker = new Error('original RPC error')
async function run() {
  let calls = 0
  if (mode === 'constructor-veto' || mode === 'undefined-veto') {
    globalThis.Promise = new Proxy(NativePromise, {
      construct() {
        throw mode === 'constructor-veto' ? marker : undefined
      },
    })
    const operation = callClientRpc(() => {
      calls++
    })
    assert(operation instanceof NativePromise)
    let caught = false
    try {
      await operation
    } catch (error) {
      caught = true
      assert.equal(error, mode === 'constructor-veto' ? marker : undefined)
    }
    assert.equal(caught, true)
    assert.equal(calls, 0)
  } else if (
    mode === 'before-start' ||
    mode === 'after-start' ||
    mode === 'synchronous-start-error'
  ) {
    const operation = callClientRpc((complete, fail, sent) => {
      calls++
      if (mode === 'synchronous-start-error') throw marker
      if (mode === 'after-start') {
        sent()
        nextTask(() => fail(marker))
      } else fail(marker)
    })
    await assert.rejects(operation, (error) => error === marker)
    assert.equal(calls, 1)
  } else if (mode === 'foreign') {
    const trace = []
    globalThis.Promise = new Proxy(NativePromise, {
      construct(target, args) {
        trace.push('construct')
        const actual = new NativePromise((resolve, reject) =>
          args[0]((value) => {
            trace.push('resolved-' + typeof value)
            resolve(value)
          }, reject)
        )
        const foreign = {
          then(fulfilled, rejected) {
            assert.equal(this, foreign)
            trace.push('then')
            return Reflect.apply(nativeThen, actual, [fulfilled, rejected])
          },
        }
        return foreign
      },
    })
    const result = await callClientRpc((complete, fail, sent) => {
      calls++
      sent()
      nextTask(() => complete(undefined))
    })
    assert.equal(result, undefined)
    assert.equal(calls, 1)
    assert.deepEqual(trace, ['construct', 'then', 'resolved-undefined', 'then'])
  } else if (mode === 'overlap') {
    const starts = [],
      completed = []
    const first = callClientRpc((complete, fail, sent) => {
      starts.push({ complete, sent })
      sent()
    }).then(() => completed.push('first'))
    const second = callClientRpc((complete, fail, sent) => {
      starts.push({ complete, sent })
      sent()
    }).then(() => completed.push('second'))
    assert.equal(starts.length, 2)
    starts[1].complete(undefined)
    await second
    starts[0].complete(undefined)
    await first
    assert.deepEqual(completed, ['second', 'first'])
  } else if (mode === 'nested') {
    let nested
    const result = await callClientRpc((complete, fail, sent) => {
      nested = callClientRpc((innerComplete, innerFail, innerSent) => {
        innerSent()
        nextTask(() => innerComplete('inner'))
      })
      sent()
      nested.then((value) => complete(value + '-outer'), fail)
    })
    assert.equal(await nested, 'inner')
    assert.equal(result, 'inner-outer')
  } else if (mode === 'current-constructor-value') {
    const value = Object.freeze({ public: true })
    const trace = []
    const Constructor = new Proxy(NativePromise, {
      construct(target, args, receiver) {
        assert.equal(receiver, Constructor)
        assert.equal(args.length, 1)
        assert.equal(args[0].length, 2)
        trace.push('construct')
        return Reflect.construct(
          target,
          [
            function (resolve, reject) {
              args[0]((actual) => {
                assert.equal(actual, value)
                trace.push('value')
                resolve(actual)
              }, reject)
            },
          ],
          receiver
        )
      },
    })
    globalThis.Promise = Constructor
    assert.equal(
      await callClientRpc((complete, fail, sent) => {
        sent()
        nextTask(() => complete(value))
      }),
      value
    )
    assert.deepEqual(trace, ['construct', 'value'])
  } else if (mode === 'late-executor-snapshot') {
    let executor, resolveReturned, rejectReturned, actualFail, complete
    globalThis.Promise = new Proxy(NativePromise, {
      construct(target, args) {
        executor = args[0]
        return new NativePromise((resolve, reject) => {
          resolveReturned = resolve
          rejectReturned = reject
        })
      },
    })
    const operation = callClientRpc((onComplete, onFail, sent) => {
      complete = onComplete
      actualFail = onFail
      sent()
    })
    const joined = operation.catch((error) => {
      throw error
    })
    assert.equal(complete, undefined)
    executor(resolveReturned, rejectReturned)
    assert.throws(() => actualFail(marker), TypeError)
    resolveReturned(undefined)
    await joined
  } else if (mode === 'cancel-before-start') {
    const controller = new AbortController()
    controller.abort(marker)
    const operation = callClientRpc((complete, fail, sent) => {
      if (controller.signal.aborted) {
        fail(controller.signal.reason)
        return
      }
      calls++
      sent()
      complete(undefined)
    })
    await assert.rejects(operation, (error) => error === marker)
    assert.equal(calls, 0)
  } else throw Error('Unknown mode')
  globalThis.Promise = NativePromise
  await new NativePromise((resolve) => nextTask(resolve))
  process.stdout.write(
    JSON.stringify({
      mode,
      actualStartAndReplyOnly: true,
      resultConstructedBeforeWork: true,
      originalFailuresAndValues: true,
    }) + '\n'
  )
}
run().catch((error) => {
  globalThis.Promise = NativePromise
  console.error(error)
  process.exitCode = 1
})
