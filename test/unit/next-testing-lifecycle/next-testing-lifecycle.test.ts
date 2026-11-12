import {
  initializeModuleCache,
  resetModules,
} from 'next/dist/experimental/testing/mocking/module-cache'

import { createModuleImportTracker } from 'next/dist/experimental/testing/runner/imports'

import { createAsyncScope } from 'next/dist/experimental/testing/runner/async-context'

import { createCollector } from 'next/dist/experimental/testing/runner/collector'

import { execFile } from 'node:child_process'

import { promisify } from 'node:util'

import { join } from 'node:path'

describe('compiler-owned actual module cache reset', () => {
  function context() {
    return Object.assign(Object.create(null), {
      c: new Map([
        ['subject', { exports: { count: 1 } }],
        ['dependency', { exports: { count: 1 } }],
        ['facade', { exports: { identity: 'protected' } }],
        ['bootstrap', { exports: { identity: 'protected' } }],
      ]),
      M: new Map(
        ['subject', 'dependency', 'facade', 'bootstrap'].map((id) => [
          id,
          () => {},
        ])
      ),
      m: { id: 'bootstrap' },
    })
  }
  const manifest = {
    version: 1 as const,
    resettable: ['subject', 'dependency'],
    protected: ['facade'],
  }

  it('evicts only authorized evaluated records while retaining factories and held namespace objects', () => {
    const runtime = context()
    const held = runtime.c.get('subject')!
    const factories = [...runtime.M]
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      resetModules()
      expect([...runtime.c.keys()]).toEqual(['facade', 'bootstrap'])
      expect([...runtime.M]).toEqual(factories)
      expect(held.exports.count).toBe(1)
      expect(retire).toHaveBeenCalledWith([held, { exports: { count: 1 } }])
      // The retained factory table, rather than a name/value cache, remains owned
      // by the actual compiled runtime; absent evaluations need no deletion.
      resetModules()
      expect(retire).toHaveBeenLastCalledWith([])
    } finally {
      owner.dispose()
    }
    expect(() => resetModules()).toThrow('active compiler-owned module cache')
  })

  it('validates the complete reset before mutation or an ownership handoff', () => {
    const runtime = context()
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      runtime.M.delete('dependency')
      expect(() => resetModules()).toThrow('retained native factory')
      expect([...runtime.c.keys()]).toEqual([
        'subject',
        'dependency',
        'facade',
        'bootstrap',
      ])
      expect(retire).not.toHaveBeenCalled()
      runtime.M.set('dependency', () => {})
      retire.mockImplementationOnce(() => {
        throw new Error('tracker closed')
      })
      expect(() => resetModules()).toThrow('tracker closed')
      expect(runtime.c.has('subject')).toBe(true)
      const retained = runtime.c
      runtime.c = new Map(retained)
      expect(() => resetModules()).toThrow('owner changed after initialization')
      expect(retained.has('subject')).toBe(true)
    } finally {
      owner.dispose()
    }
    for (const resettable of [
      ['facade'],
      ['bootstrap'],
      ['subject', 'subject'],
    ])
      expect(() =>
        initializeModuleCache(runtime, { ...manifest, resettable }, () => {})
      ).toThrow('protected runtime identities')
  })

  it('keeps evicted top-level-await evaluations visible until their actual settlement', async () => {
    const runtime = context()
    // Each file gets its own actual runtime prototype; no global timer is used
    // to decide whether the pending evaluation settled.
    Object.setPrototypeOf(runtime, {})
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    let observe!: () => void
    const observed = new Promise<void>((resolve) => {
      observe = resolve
    })
    const getter = () => {
      observe()
      return pending
    }
    const module = Object.defineProperties(
      {},
      { exports: { get: getter }, namespaceObject: { get: getter } }
    )
    runtime.c.set('subject', module)
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      let settled = false
      const waiting = tracker.waitForImports().then(() => {
        settled = true
      })
      await observed
      expect(settled).toBe(false)
      expect(runtime.c.has('subject')).toBe(false)
      complete()
      await waiting
      expect(settled).toBe(true)
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })

  it('cancels settling of an evicted pending evaluation on real tracker disposal', async () => {
    const runtime = context()
    Object.setPrototypeOf(runtime, {})
    const pending = new Promise(() => {})
    const getter = () => pending
    runtime.c.set(
      'subject',
      Object.defineProperties(
        {},
        { exports: { get: getter }, namespaceObject: { get: getter } }
      )
    )
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      const waiting = tracker.waitForImports()
      tracker.dispose()
      await expect(waiting).rejects.toThrow('cancelled during file cleanup')
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })
})

it('retains actual unbound fixture operation refusals without adding public API properties', () => {
  const c = createCollector('unbound-fixture-receivers')
  const api = c.api.test.extend('value', 1)
  const keys = Reflect.ownKeys(api)
  for (const operation of [api.extend, api.override]) {
    expect(() => Reflect.apply(operation, undefined, ['value', 2])).toThrow(
      "Cannot read properties of undefined (reading 'getFixtures')"
    )
  }
  expect(Reflect.ownKeys(api)).toEqual(keys)
  expect(Object.getOwnPropertySymbols(api)).toEqual([])
  c.close()
})

it('captures options-only proxy fields in the target registration order without consuming ordinary object values', () => {
  const c = createCollector('options-only-reads')
  const events: unknown[] = []
  const selected = new Proxy(
    { auto: false, scope: 'test', injected: false, ignored: true },
    {
      ownKeys(target) {
        events.push('keys')
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, key) {
        events.push(['descriptor', key])
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get(target, key, receiver) {
        events.push(['get', key])
        return Reflect.get(target, key, receiver)
      },
    }
  )
  c.api.test.extend('value', selected)
  expect(events).toEqual([
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    ['get', 'auto'],
    ['get', 'scope'],
    ['get', 'injected'],
  ])
  events.length = 0
  const ordinary = new Proxy(
    { port: 3 },
    {
      ownKeys(target) {
        events.push('ordinary keys')
        return Reflect.ownKeys(target)
      },
    }
  )
  c.api.test.extend('value', ordinary)
  expect(events).toEqual(['ordinary keys'])
  c.close()
})

describe('raw test declaration fn', () => {
  const receiver = () => ({
    concurrent: false,
    only: false,
    skip: false,
    todo: false,
    fails: false,
  })

  it('publishes one readonly root callable and shares its actual helper members', () => {
    const c = createCollector('raw-declaration')
    const t = c.api.test
    expect(Object.getOwnPropertyDescriptor(t, 'fn')).toEqual({
      value: t.fn,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    expect([t.fn.name, t.fn.length]).toEqual(['', 3])
    expect(t.fn).toBe(c.api.it.fn)
    expect((t.fn as any).each).toBe(t.each)
    expect((t.fn as any).for).toBe(t.for)
    expect((t.fn as any).extend).toBe(t.extend)
    expect((t.fn as any).describe).toBe(c.api.describe)
    for (const key of ['skip', 'only', 'todo', 'concurrent', 'fails'])
      expect(t[key].fn).toBeUndefined()
    expect(t.skipIf(false)).toBe(t)
    expect(t.runIf(true)).toBe(t)
    expect(t.extend({ value: 3 }).fn).not.toBe(t.fn)
  })

  it('retains receiver reads, authored option writes and raw public fails values', () => {
    const c = createCollector('raw-receiver')
    const reads: string[] = []
    const context: any = {}
    for (const key of [
      'concurrent',
      'only',
      'skip',
      'todo',
      'fails',
      'ignored',
    ])
      Object.defineProperty(context, key, {
        enumerable: true,
        get() {
          reads.push(`receiver:${key}`)
          return key === 'fails' ? 1 : false
        },
      })
    let concurrent = true
    const opts: any = {}
    Object.defineProperty(opts, 'concurrent', {
      enumerable: true,
      get() {
        reads.push('options:get-concurrent')
        return concurrent
      },
      set(value) {
        reads.push(`options:set-concurrent:${value}`)
        concurrent = value
      },
    })
    expect(c.api.test.fn.call(context, 'raw', opts, () => {})).toBeUndefined()
    expect(reads).toEqual([
      'receiver:concurrent',
      'options:set-concurrent:false',
      'receiver:concurrent',
      'receiver:only',
      'receiver:skip',
      'receiver:todo',
      'receiver:fails',
      'receiver:ignored',
      'options:get-concurrent',
    ])
    expect(c.root.children[0].options.fails).toBe(1)
    expect(concurrent).toBe(false)
    expect(() =>
      c.api.test('ordinary', { concurrent: 1 as any }, () => {})
    ).toThrow('Test concurrent must be a boolean.')
    expect(() =>
      c.api.test('ordinary fails', { fails: 1 as any }, () => {})
    ).toThrow('Test fails must be a boolean.')
    expect(c.root.children).toHaveLength(1)
  })

  it('requires an actual chain receiver for the shared parameter and fixture helpers', () => {
    const c = createCollector('raw-members')
    const raw = c.api.test.fn as any
    for (const key of ['each', 'for'])
      expect(() => raw[key]([1])).toThrow(
        "Cannot read properties of undefined (reading 'withContext')"
      )
    for (const key of ['extend', 'override'])
      expect(() => raw[key]({ value: 1 })).toThrow(
        "Cannot read properties of undefined (reading 'getFixtures')"
      )
    raw.each.call(c.api.test.skip, [1])('skipped %i', () => {})
    expect(c.root.children.map((c) => [c.name, c.mode])).toEqual([
      ['skipped 1', 'skip'],
    ])
  })

  it('dispatches held raw declarations to the live collector without borrowing a closed scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first', { getActiveCollector: () => active })
    const held = first.api.test.fn
    first.close()
    const second = createCollector('second')
    active = second
    held.call(receiver(), 'second declaration', {}, () => {})
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((c) => c.name)).toEqual([
      'second declaration',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old', name: 'old' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        held.call(receiver(), 'late', {}, () => {})
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old"')
    expect(second.root.children).toHaveLength(1)
  })

  it('keeps a cached raw suite alias subject to its originating collection scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first alias', {
      getActiveCollector: () => active,
    })
    const heldAlias = (first.api.test.fn as any).describe
    first.close()
    const second = createCollector('second alias')
    active = second
    heldAlias('live suite', () => second.api.test('child', () => {}))
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((child) => child.name)).toEqual([
      'live suite',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old-alias', name: 'old alias' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        heldAlias('late suite', () => second.api.test('late child', () => {}))
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old alias"')
    expect(second.root.children).toHaveLength(1)
  })
})

describe('raw suite declaration collectors', () => {
  const flags = () => ({
    concurrent: false,
    only: false,
    skip: false,
    todo: false,
    shuffle: false,
  })

  it('requires a file before collecting and does not let disposed methods borrow a new owner', async () => {
    const c = createCollector('raw-owner')
    let invoked = 0
    const api = c.api.describe.fn.call(flags(), 'suite', {}, (provided) => {
      invoked++
      provided('child', () => {})
    })
    await expect(api.collect(undefined as any)).rejects.toThrow(
      'File is required to collect tasks.'
    )
    expect(invoked).toBe(0)
    await c.settle()
    expect(invoked).toBe(1)
    c.close()
    expect(() => api.task('late', { handler() {} })).toThrow(
      'Test collection has already closed.'
    )
    expect(() => api.clear()).toThrow('Test collection has already closed.')
    expect(() => api.on('beforeEach', () => {})).toThrow(
      'Test collection has already closed.'
    )
    await expect(api.collect(api.file)).rejects.toThrow(
      'Test collection has already closed.'
    )
    expect(invoked).toBe(1)
  })
})

it('serializes native and receiver-sensitive stack getters without mutating the raw failure', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-stack-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 10,
    nativeEmptyNonemptyUndefined: true,
    originalGetterReceiverAndReadCounts: true,
    weakMapAndThrowingGetters: true,
    serializerWritesStayLocal: true,
    originalDescriptorsValuesAndCausePreserved: true,
    capturedAccessorInvocation: true,
  })
}, 20000)

it('preserves original error getter receivers and clone-local serializer writes', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 22,
    untouchedOwnAndInheritedGetterReceivers: true,
    exactReadCountOrderAndThrowUndefined: true,
    ordinaryMethodDataPrototypeAndKeyOrder: true,
    nativeStackAndDescriptorMutation: true,
    setterWritesStayLocal: true,
    directSelfAndCauseCycles: true,
    capturedNewIntrinsics: true,
    postSetterGetterReceiverParityNotClaimed: true,
  })
}, 20000)

it('preserves original error aliases through the private serializer cache', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-aliases.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 19,
    selfAndNestedAliases: 12,
    scalarReceiversAndExactGetterCounts: true,
    ordinaryAccessorReceiversRetained: true,
    primitivesNullCauseAndSharedArray: true,
    fallbackAndThrowUndefined: true,
    originalDescriptorsAndDataHeld: true,
    publicProcessErrorUnchanged: true,
  })
}, 20000)

describe('normal SuiteAPI collector ownership', () => {
  it.each([
    undefined,
    null,
    false,
    0,
    '',
    new Error('actual normal factory rejection'),
  ])(
    'stops starting later factories after an actual rejection: %p',
    async (failure) => {
      const c = createCollector('normal-suite-stop', {
        observeSettledDeclarationCoverage: true,
      })
      const trace: string[] = []
      const first = c.api.describe('first', async () => {
        trace.push('first entered')
        await Promise.resolve()
        trace.push('first rejected')
        throw failure
      })
      c.api.describe('second', async () => {
        trace.push('second entered')
        throw failure
      })
      const returned: unknown[] = []
      await c.settle().then(
        () => returned.push('fulfilled'),
        (error) => returned.push(error)
      )
      expect(returned).toEqual([failure])
      expect(trace).toEqual(['first entered', 'first rejected'])
      const observed = c.getCompletedDeclarationCoverageFailure!()
      expect(observed!.error).toBe(failure)
      expect(observed!.occurrences).toHaveLength(1)
      expect(observed!.occurrences[0].suite).toBe(c.root.children[0])
      expect(observed!.occurrences[0].reason).toBe(failure)
      expect(first.tasks).toEqual([])
      await c.settle().then(
        () => returned.push('fulfilled'),
        (error) => returned.push(error)
      )
      expect(returned).toEqual([failure, failure])
      expect(trace).toEqual(['first entered', 'first rejected'])
      expect(c.getCompletedDeclarationCoverageFailure!()).toBeUndefined()
      c.close()
    }
  )

  it('withholds declaration coverage certification after an actual manual collect invocation', async () => {
    const c = createCollector('normal-suite-manual-coverage', {
      observeSettledDeclarationCoverage: true,
    })
    const failure = new Error('manual and automatic actual rejection')
    let calls = 0
    const collector = c.api.describe('owned', async () => {
      calls++
      throw failure
    })
    await expect(collector.collect(collector.file)).rejects.toBe(failure)
    await expect(c.settle()).rejects.toBe(failure)
    expect(calls).toBe(2)
    expect(c.getCompletedDeclarationCoverageFailure!()).toBeUndefined()
    c.close()
  })
})
