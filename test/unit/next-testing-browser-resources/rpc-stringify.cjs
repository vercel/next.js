'use strict'
const assert = require('node:assert/strict')
const {
  createClientRpcPrimitives,
} = require('next/dist/experimental/testing/client/rpc-primitives')
const mode = process.argv[2]
const NativeJSON = JSON
const originalGlobal = Object.getOwnPropertyDescriptor(globalThis, 'JSON')
const originalStringify = Object.getOwnPropertyDescriptor(
  NativeJSON,
  'stringify'
)
const nativeStringify = NativeJSON.stringify
const marker = new Error('original stringify marker')
const replace = (value) =>
  Object.defineProperty(globalThis, 'JSON', { ...originalGlobal, value })
try {
  if (mode === 'function-values') {
    const rpc = createClientRpcPrimitives()
    let lateCalls = 0
    NativeJSON.stringify = () => {
      lateCalls++
      throw marker
    }
    const trace = []
    const value = {
      toJSON() {
        trace.push('toJSON')
        assert.equal(this, value)
        return this
      },
      get a() {
        trace.push('get:a')
        assert.equal(this, value)
        return 1
      },
    }
    assert.equal(rpc.stringifyRpc(value), '{"a":1}')
    assert.deepEqual(trace, ['toJSON', 'get:a'])
    assert.equal(lateCalls, 0)
    assert.equal(rpc.stringifyRpc(undefined), undefined)
    assert.equal(rpc.stringifyRpc(null), 'null')
    assert.equal(rpc.stringifyRpc(Symbol('omitted')), undefined)
    assert.throws(
      () =>
        rpc.stringifyRpc({
          get a() {
            throw marker
          },
        }),
      (error) => error === marker
    )
    let caught = false
    try {
      rpc.stringifyRpc({
        toJSON() {
          throw undefined
        },
      })
    } catch (error) {
      caught = true
      assert.equal(error, undefined)
    }
    assert.equal(caught, true)
  } else if (mode === 'receiver') {
    const value = { opaque: true }
    let calls = 0
    const owner = {
      stringify(...args) {
        calls++
        assert.equal(this, owner)
        assert.deepEqual(args, [value])
        return marker
      },
    }
    replace(owner)
    const rpc = createClientRpcPrimitives()
    replace(NativeJSON)
    owner.stringify = () => {
      throw Error('late data method')
    }
    assert.equal(rpc.stringifyRpc(value), marker)
    assert.equal(calls, 1)
  } else if (mode === 'global-accessor') {
    let reads = 0,
      calls = 0
    const owner = {
      stringify(value) {
        calls++
        assert.equal(this, owner)
        assert.equal(value, marker)
        return undefined
      },
    }
    Object.defineProperty(globalThis, 'JSON', {
      configurable: true,
      get() {
        reads++
        return owner
      },
    })
    const rpc = createClientRpcPrimitives()
    assert.equal(reads, 0)
    assert.equal(rpc.stringifyRpc(marker), undefined)
    assert.equal(reads, 1)
    assert.equal(calls, 1)
    Object.defineProperty(globalThis, 'JSON', {
      configurable: true,
      get() {
        reads++
        throw marker
      },
    })
    assert.throws(
      () => rpc.stringifyRpc(marker),
      (error) => error === marker
    )
    assert.equal(reads, 2)
  } else if (mode === 'method-accessor') {
    let reads = 0,
      calls = 0
    const owner = {
      get stringify() {
        reads++
        return function (value) {
          calls++
          assert.equal(this, owner)
          return value
        }
      },
    }
    replace(owner)
    const rpc = createClientRpcPrimitives()
    assert.equal(reads, 0)
    assert.equal(rpc.stringifyRpc(marker), marker)
    assert.equal(reads, 1)
    assert.equal(calls, 1)
    Object.defineProperty(owner, 'stringify', {
      get() {
        reads++
        throw undefined
      },
    })
    let caught = false
    try {
      rpc.stringifyRpc(marker)
    } catch (error) {
      caught = true
      assert.equal(error, undefined)
    }
    assert.equal(caught, true)
    assert.equal(reads, 2)
  } else if (mode === 'missing-late') {
    delete globalThis.JSON
    const rpc = createClientRpcPrimitives()
    assert.throws(() => rpc.stringifyRpc({ a: 1 }), ReferenceError)
    replace(NativeJSON)
    assert.equal(rpc.stringifyRpc({ a: 1 }), '{"a":1}')
  } else if (mode === 'noncallable') {
    replace(42)
    const primitive = createClientRpcPrimitives()
    assert.throws(() => primitive.stringifyRpc(marker), TypeError)
    replace({ stringify: 1 })
    const noncallable = createClientRpcPrimitives()
    assert.throws(() => primitive.stringifyRpc(marker), TypeError)
    assert.throws(() => noncallable.stringifyRpc(marker), TypeError)
    replace(NativeJSON)
    assert.equal(primitive.stringifyRpc({ a: 1 }), '{"a":1}')
    assert.equal(noncallable.stringifyRpc({ a: 1 }), '{"a":1}')
  } else if (mode === 'proxy-bootstrap') {
    for (const captureFailure of [undefined, marker]) {
      let descriptors = 0,
        gets = 0,
        calls = 0,
        proxy
      const owner = {
        stringify(value) {
          calls++
          assert.equal(this, proxy)
          return value
        },
      }
      proxy = new Proxy(owner, {
        getOwnPropertyDescriptor() {
          descriptors++
          throw captureFailure
        },
        get(target, key, receiver) {
          gets++
          return Reflect.get(target, key, receiver)
        },
      })
      replace(proxy)
      const rpc = createClientRpcPrimitives()
      assert.equal(descriptors, 1)
      assert.equal(gets, 0)
      assert.equal(rpc.stringifyRpc(marker), marker)
      assert.equal(gets, 1)
      assert.equal(calls, 1)
      const actualFailure = new Error('original late lookup')
      replace(
        new Proxy(owner, {
          getOwnPropertyDescriptor() {
            throw captureFailure
          },
          get() {
            throw actualFailure
          },
        })
      )
      const late = createClientRpcPrimitives()
      assert.throws(
        () => late.stringifyRpc(marker),
        (error) => error === actualFailure
      )
      owner.stringify = function () {
        throw undefined
      }
      replace(proxy)
      const throwing = createClientRpcPrimitives()
      let caught = false
      try {
        throwing.stringifyRpc(marker)
      } catch (error) {
        caught = true
        assert.equal(error, undefined)
      }
      assert.equal(caught, true)
    }
  } else throw Error('Unknown mode')
} finally {
  Object.defineProperty(NativeJSON, 'stringify', originalStringify)
  Object.defineProperty(globalThis, 'JSON', originalGlobal)
}
process.stdout.write(
  Reflect.apply(nativeStringify, NativeJSON, [
    {
      mode,
      dataCaptureBeforeAuthoredLoading: true,
      bootstrapFallbacksHeld: true,
      originalReceiverValuesAndErrors: true,
    },
  ]) + '\n'
)
