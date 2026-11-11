import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, realm, phase] = process.argv.slice(2)
const consumer = path.resolve(consumerArg),
  out = path.resolve(outputArg)
fs.mkdirSync(out, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, out, realm, 'child'],
    { cwd: consumer, env, auditDir: path.join(out, 'owners'), timeoutMs: 30000 }
  )
  fs.writeFileSync(
    path.join(out, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(out, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(out, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual private restoration primitive ' + realm
  )
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(path.join(consumer, 'package.json'))
  const modulePath = load.resolve(
    'next/dist/experimental/testing/primitives' +
      (realm === 'browser' ? '/browser' : '')
  )
  const imported = await import(pathToFileURL(modulePath))
  const spies = imported.spies ?? imported.default?.spies ?? imported
  assert.equal(typeof spies.createMockRestorationObservation, 'function')
  const rows = []
  function record(name, callback) {
    callback()
    rows.push({ name, passed: true })
  }
  record('inactive-public-shape-and-return', () => {
    const target = {
        method(value) {
          return value + 1
        },
      },
      mock = spies.spyOn(target, 'method')
    assert.equal(target.method(2), 3)
    assert.equal(Object.hasOwn(mock, 'createMockRestorationObservation'), false)
    assert.equal(Object.hasOwn(mock, 'take'), false)
    assert.deepEqual(Object.keys(mock), [
      '_isMockFunction',
      'getMockImplementation',
      'mock',
      'mockImplementation',
      'mockImplementationOnce',
      'withImplementation',
      'mockReturnThis',
      'mockReturnValue',
      'mockReturnValueOnce',
      'mockThrow',
      'mockThrowOnce',
      'mockResolvedValue',
      'mockResolvedValueOnce',
      'mockRejectedValue',
      'mockRejectedValueOnce',
      'mockClear',
      'mockReset',
      'mockRestore',
      'mockName',
      'getMockName',
    ])
    assert.equal(mock.name, 'method')
    assert.equal(mock.length, 1)
    assert.equal(mock.mockRestore(), undefined)
    assert.equal(target.method(4), 5)
    spies.restoreAllMocks()
  })
  record('actual-same-error-first-and-private-fallback-occurrences', () => {
    const failure = new Error('same actual restoration failure'),
      before = Object.getOwnPropertyDescriptors(failure)
    let blocked = false,
      restores = 0
    const target = new Proxy(
      {
        method() {
          return 1
        },
      },
      {
        defineProperty(object, key, descriptor) {
          if (blocked) {
            restores++
            throw failure
          }
          return Reflect.defineProperty(object, key, descriptor)
        },
      }
    )
    const mock = spies.spyOn(target, 'method')
    blocked = true
    try {
      const first = spies.createMockRestorationObservation()
      assert.equal(first.take(), undefined)
      assert.throws(
        () => first.run(() => mock.mockRestore()),
        (error) => error === failure
      )
      const a = first.take()
      assert(Object.isFrozen(a) && Object.isFrozen(a[0]))
      assert.equal(a.length, 1)
      assert.equal(a[0].mock, mock)
      assert.equal(a[0].status, 'rejected')
      assert.equal(a[0].reason, failure)
      const second = spies.createMockRestorationObservation()
      assert.throws(
        () => second.run(() => spies.restoreAllMocks()),
        (error) => error === failure
      )
      const b = second.take()
      assert.equal(b.length, 1)
      assert.equal(b[0].mock, mock)
      assert.equal(b[0].restore, a[0].restore)
      assert.equal(b[0].reason, failure)
      assert.notEqual(a[0], b[0])
      assert.equal(restores, 2)
      assert.deepEqual(Object.getOwnPropertyDescriptors(failure), before)
    } finally {
      blocked = false
      mock.mockRestore()
      spies.restoreAllMocks()
    }
  })
  record('return-receiver-count-and-no-then-read', () => {
    let calls = 0,
      thenReads = 0,
      receiver
    const payload = {
      get then() {
        thenReads++
        throw Error('must not read then')
      },
    }
    function restore() {
      calls++
      receiver = this
      assert.equal(arguments.length, 0)
      return payload
    }
    const mock = spies.createMockInstance({ restore })
    const observation = spies.createMockRestorationObservation()
    assert.equal(
      observation.run(() => mock.mockRestore()),
      payload
    )
    assert.equal(calls, 1)
    assert.equal(receiver, undefined)
    assert.equal(thenReads, 0)
    const [call] = observation.take()
    assert.equal(call.value, payload)
    assert.equal(call.restore, restore)
    assert.equal(call.mock, mock)
    assert.equal(call.status, 'fulfilled')
    spies.restoreAllMocks()
  })
  record('missing-actual-restore-and-unknown-reset-failure', () => {
    const failure = new Error('same error outside actual restore')
    const mock = spies.fn()
    const original = mock.mockReset
    mock.mockReset = () => {
      throw failure
    }
    const observation = spies.createMockRestorationObservation()
    assert.throws(
      () => observation.run(() => mock.mockRestore()),
      (error) => error === failure
    )
    assert.deepEqual(observation.take(), [])
    mock.mockReset = original
    spies.restoreAllMocks()
  })
  record('same-restore-function-two-mocks-is-unqualified', () => {
    let calls = 0
    const restore = () => {
      calls++
    }
    const first = spies.createMockInstance({ restore }),
      second = spies.createMockInstance({ restore })
    const observation = spies.createMockRestorationObservation()
    assert.equal(
      observation.run(() => first.mockRestore()),
      undefined
    )
    assert.equal(calls, 1)
    assert.equal(observation.take(), undefined)
    second.mockRestore()
    spies.restoreAllMocks()
  })
  record('single-run-and-immutable-take', () => {
    const observation = spies.createMockRestorationObservation()
    const value = {}
    assert.equal(
      observation.run(() => value),
      value
    )
    assert(Object.isFrozen(observation))
    assert(Object.isFrozen(observation.take()))
    assert.throws(
      () =>
        observation.run(() => {
          throw Error('callback must not run')
        }),
      /already ran/
    )
    assert.equal(observation.take(), undefined)
  })
  record('nested-handles-have-distinct-actual-owners', () => {
    const a = spies.spyOn(
        {
          a() {
            return 1
          },
        },
        'a'
      ),
      b = spies.spyOn(
        {
          b() {
            return 2
          },
        },
        'b'
      )
    const outer = spies.createMockRestorationObservation(),
      inner = spies.createMockRestorationObservation()
    outer.run(() => {
      inner.run(() => a.mockRestore())
      b.mockRestore()
    })
    assert.equal(inner.take().length, 1)
    assert.equal(inner.take()[0].mock, a)
    assert.equal(outer.take().length, 1)
    assert.equal(outer.take()[0].mock, b)
    spies.restoreAllMocks()
  })
  record('fallback-stop-and-original-call-order', () => {
    const failure = new Error('actual first fallback stop')
    let blocked = false
    const order = []
    const a = spies.createMockInstance({
        restore() {
          order.push('a')
          if (blocked) throw failure
        },
      }),
      b = spies.createMockInstance({
        restore() {
          order.push('b')
        },
      })
    blocked = true
    try {
      const observation = spies.createMockRestorationObservation()
      assert.throws(
        () => observation.run(() => spies.restoreAllMocks()),
        (error) => error === failure
      )
      assert.deepEqual(order, ['a'])
      assert.equal(observation.take().length, 1)
      assert.equal(observation.take()[0].mock, a)
      assert.notEqual(observation.take()[0].mock, b)
    } finally {
      blocked = false
      spies.restoreAllMocks()
    }
  })

  record('inactive-private-map-intrinsics-preserve-authored-counts', () => {
    const originalSet = WeakMap.prototype.set,
      originalGet = WeakMap.prototype.get
    let sets = 0,
      gets = 0,
      mock
    try {
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.set = function (...args) {
        sets++
        return Reflect.apply(originalSet, this, args)
      }
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.get = function (...args) {
        gets++
        return Reflect.apply(originalGet, this, args)
      }
      mock = spies.spyOn(
        {
          method() {
            return 1
          },
        },
        'method'
      )
    } finally {
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.set = originalSet
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.get = originalGet
    }
    assert.equal(sets, 2)
    assert.equal(gets, 0)
    mock.mockRestore()
    spies.restoreAllMocks()
  })
  record('active-owner-lookup-cannot-replace-actual-restore', () => {
    const originalGet = WeakMap.prototype.get,
      actual = new Error('actual restore rejection'),
      foreign = new Error('author WeakMap get must not replace restore')
    let restores = 0,
      blocked = true
    const mock = spies.createMockInstance({
      restore() {
        restores++
        if (blocked) throw actual
      },
    })
    const observation = spies.createMockRestorationObservation()
    try {
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.get = () => {
        throw foreign
      }
      assert.throws(
        () => observation.run(() => spies.restoreAllMocks()),
        (error) => error === actual
      )
    } finally {
      // eslint-disable-next-line no-extend-native -- Measure an authored override and restore the original descriptor in finally.
      WeakMap.prototype.get = originalGet
    }
    assert.equal(restores, 1)
    assert.equal(observation.take().length, 1)
    assert.equal(observation.take()[0].mock, mock)
    assert.equal(observation.take()[0].reason, actual)
    blocked = false
    spies.restoreAllMocks()
  })
  fs.writeFileSync(
    path.join(out, 'VERIFIED.json'),
    JSON.stringify(
      {
        realm,
        rows,
        passed: rows.length,
        actualRestoreRegistry: true,
        noFileDisposalAuthorization: true,
        publicMockKeysUnchanged: true,
      },
      null,
      2
    ) + '\n'
  )
}
