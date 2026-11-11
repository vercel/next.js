'use strict'
const assert = require('node:assert/strict')
const {
  createClientRpcPrimitives,
} = require('next/dist/experimental/testing/client/rpc-primitives')
const mode = process.argv[2]
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
const originalResponse = Object.getOwnPropertyDescriptor(globalThis, 'Response')
const NativeResponse = Response
const nativeJson = Object.getOwnPropertyDescriptor(
  NativeResponse.prototype,
  'json'
)
const marker = new Error('original RPC marker')
async function run() {
  if (mode === 'fetch') {
    const calls = []
    const original = function (...args) {
      calls.push({ receiver: this, args })
      return marker
    }
    globalThis.fetch = original
    const rpc = createClientRpcPrimitives()
    globalThis.fetch = () => {
      throw Error('late authored fetch')
    }
    assert.equal(rpc.fetchRpc, original)
    const invoke = rpc.fetchRpc
    assert.equal(invoke('owned', { method: 'POST' }), marker)
    assert.deepEqual(calls, [
      { receiver: undefined, args: ['owned', { method: 'POST' }] },
    ])
  } else if (mode === 'missing-late') {
    delete globalThis.fetch
    delete globalThis.Response
    const rpc = createClientRpcPrimitives()
    assert.equal(rpc.fetchRpc, undefined)
    const response = {
      json() {
        return marker
      },
    }
    assert.equal(rpc.readRpcJson(response), marker)
    globalThis.fetch = () => marker
    globalThis.Response = NativeResponse
    response.json = function () {
      assert.equal(this, response)
      return undefined
    }
    assert.equal(rpc.readRpcJson(response), undefined)
    assert.equal(createClientRpcPrimitives().fetchRpc(), marker)
  } else if (mode === 'native-json') {
    const rpc = createClientRpcPrimitives()
    assert.deepEqual(
      await rpc.readRpcJson(new NativeResponse('{"first":true}')),
      { first: true }
    )
    let authoredCalls = 0
    Object.defineProperty(NativeResponse.prototype, 'json', {
      ...nativeJson,
      value() {
        authoredCalls++
        return Promise.resolve({ authored: true })
      },
    })
    assert.deepEqual(
      await rpc.readRpcJson(new NativeResponse('{"owned":true}')),
      { owned: true }
    )
    assert.deepEqual(await new NativeResponse('{}').json(), { authored: true })
    assert.equal(authoredCalls, 1)
  } else if (mode === 'own-shadow') {
    const rpc = createClientRpcPrimitives()
    await rpc.readRpcJson(new NativeResponse('{}'))
    const response = new NativeResponse('{}')
    let reads = 0,
      calls = 0
    Object.defineProperty(response, 'json', {
      get() {
        reads++
        assert.equal(this, response)
        return function () {
          calls++
          assert.equal(this, response)
          return marker
        }
      },
    })
    assert.equal(rpc.readRpcJson(response), marker)
    assert.equal(reads, 1)
    assert.equal(calls, 1)
  } else if (mode === 'bootstrap-accessor') {
    Object.defineProperty(globalThis, 'Response', {
      configurable: true,
      get() {
        throw Error('unused global Response lookup')
      },
    })
    let reads = 0,
      calls = 0
    const prototype = {
      get json() {
        reads++
        return function () {
          calls++
          return this.value
        }
      },
    }
    const response = Object.assign(Object.create(prototype), { value: marker })
    const rpc = createClientRpcPrimitives()
    assert.equal(rpc.readRpcJson(response), marker)
    response.value = undefined
    assert.equal(rpc.readRpcJson(response), undefined)
    assert.equal(reads, 2)
    assert.equal(calls, 2)
  } else if (mode === 'errors') {
    const rpc = createClientRpcPrimitives()
    let reads = 0
    const response = {
      get json() {
        reads++
        throw marker
      },
    }
    assert.throws(
      () => rpc.readRpcJson(response),
      (e) => e === marker
    )
    assert.equal(reads, 1)
    let caught = false
    try {
      rpc.readRpcJson({
        json() {
          throw undefined
        },
      })
    } catch (error) {
      caught = true
      assert.equal(error, undefined)
    }
    assert.equal(caught, true)
  } else if (mode === 'native-errors') {
    const rpc = createClientRpcPrimitives()
    await rpc.readRpcJson(new NativeResponse('{}'))
    await assert.rejects(
      rpc.readRpcJson(new NativeResponse('invalid JSON')),
      SyntaxError
    )
    const response = new NativeResponse('{}')
    await response.json()
    await assert.rejects(rpc.readRpcJson(response), TypeError)
  } else if (mode === 'replaced-bootstrap') {
    class ResponseDouble {
      constructor(value) {
        this.value = value
      }
      json() {
        return this.value
      }
    }
    globalThis.Response = ResponseDouble
    const rpc = createClientRpcPrimitives()
    const first = new ResponseDouble(marker)
    assert.equal(rpc.readRpcJson(first), marker)
    ResponseDouble.prototype.json = function () {
      throw Error('late replacement')
    }
    assert.equal(rpc.readRpcJson(new ResponseDouble(undefined)), undefined)
  } else if (mode === 'proxy-first') {
    for (const captureFailure of [undefined, marker]) {
      const result = Promise.resolve({ original: true })
      let reads = 0,
        calls = 0,
        descriptors = 0,
        response
      response = new Proxy(
        {
          json() {
            calls++
            assert.equal(this, response)
            return result
          },
        },
        {
          get(target, key, receiver) {
            if (key === 'json') reads++
            return Reflect.get(target, key, receiver)
          },
          getOwnPropertyDescriptor() {
            descriptors++
            throw captureFailure
          },
        }
      )
      const rpc = createClientRpcPrimitives()
      assert.equal(rpc.readRpcJson(response), result)
      assert.deepEqual(await result, { original: true })
      assert.equal(reads, 1)
      assert.equal(calls, 1)
      assert.equal(descriptors, 1)
      const actualFailure = new Error('original response getter')
      const getter = new Proxy(
        {},
        {
          get() {
            throw actualFailure
          },
          getOwnPropertyDescriptor() {
            throw captureFailure
          },
        }
      )
      assert.throws(
        () => createClientRpcPrimitives().readRpcJson(getter),
        (error) => error === actualFailure
      )
      let caught = false
      try {
        createClientRpcPrimitives().readRpcJson({
          json() {
            throw undefined
          },
        })
      } catch (error) {
        caught = true
        assert.equal(error, undefined)
      }
      assert.equal(caught, true)
    }
  } else if (mode === 'proxy-later') {
    class ResponseDouble {
      constructor(value) {
        this.value = value
      }
      json() {
        return this.value
      }
    }
    for (const inspection of ['prototype', 'descriptor']) {
      for (const captureFailure of [undefined, marker]) {
        const rpc = createClientRpcPrimitives()
        assert.equal(rpc.readRpcJson(new ResponseDouble(marker)), marker)
        const result = Promise.resolve({ original: true })
        let reads = 0,
          calls = 0,
          inspections = 0,
          response
        const original = ResponseDouble.prototype.json
        response = new Proxy(new ResponseDouble(result), {
          getPrototypeOf(target) {
            if (inspection === 'prototype') {
              inspections++
              throw captureFailure
            }
            return Reflect.getPrototypeOf(target)
          },
          getOwnPropertyDescriptor(target, key) {
            if (inspection === 'descriptor') {
              inspections++
              throw captureFailure
            }
            return Reflect.getOwnPropertyDescriptor(target, key)
          },
          get(target, key, receiver) {
            if (key === 'json') {
              reads++
              return function () {
                calls++
                assert.equal(this, response)
                return Reflect.apply(original, this, [])
              }
            }
            return Reflect.get(target, key, receiver)
          },
        })
        assert.equal(rpc.readRpcJson(response), result)
        assert.deepEqual(await result, { original: true })
        assert.equal(reads, 1)
        assert.equal(calls, 1)
        assert.equal(inspections, 1)
        const actualFailure = new Error('original later response getter')
        const getter = new Proxy(
          {},
          {
            getPrototypeOf() {
              throw captureFailure
            },
            get() {
              throw actualFailure
            },
          }
        )
        assert.throws(
          () => rpc.readRpcJson(getter),
          (error) => error === actualFailure
        )
        const throwing = new Proxy(
          {},
          {
            getPrototypeOf() {
              throw captureFailure
            },
            get() {
              return function () {
                throw undefined
              }
            },
          }
        )
        let caught = false
        try {
          rpc.readRpcJson(throwing)
        } catch (error) {
          caught = true
          assert.equal(error, undefined)
        }
        assert.equal(caught, true)
      }
    }
  } else throw Error('Unknown mode')
  process.stdout.write(
    JSON.stringify({
      mode,
      captureBeforeAuthoredLoading: true,
      originalLookupReceiverAndErrors: true,
    }) + '\n'
  )
}
run()
  .finally(() => {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch)
    else delete globalThis.fetch
    if (originalResponse)
      Object.defineProperty(globalThis, 'Response', originalResponse)
    else delete globalThis.Response
    Object.defineProperty(NativeResponse.prototype, 'json', nativeJson)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
