import { execFileSync } from 'node:child_process'
import { MockRegistry } from 'next/dist/experimental/testing/mocking/registry'

describe('private module mock registry (not compiler conformance)', () => {
  const original = async () => ({ value: 'original', untouched: true })

  it('evaluates once for concurrent consumers and imports the original explicitly', async () => {
    const registry = new MockRegistry()
    const factory = jest.fn(async (importOriginal) => ({
      ...(await importOriginal()),
      value: 'mocked',
    }))
    registry.register('compiler:rsc:subject', factory, original)
    const first = registry.resolve('compiler:rsc:subject')
    const second = registry.resolve('compiler:rsc:subject')
    expect(second).toBe(first)
    expect(await first).toEqual({ value: 'mocked', untouched: true })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('keeps compiler-issued layer keys and file registries independent', async () => {
    const first = new MockRegistry()
    const second = new MockRegistry()
    first.register('rsc:subject', () => ({ value: 1 }), original)
    first.register('ssr:subject', () => ({ value: 2 }), original)
    second.register('rsc:subject', () => ({ value: 3 }), original)
    expect(await first.readExport('rsc:subject', 'value')).toBe(1)
    expect(await first.readExport('ssr:subject', 'value')).toBe(2)
    first.dispose()
    first.dispose()
    expect(await second.readExport('rsc:subject', 'value')).toBe(3)
    expect(() => first.resolve('rsc:subject')).toThrow('disposed')
  })

  it('retains each native deferred original thunk across concurrent factories', async () => {
    const registry = new MockRegistry()
    const fallback = jest.fn(async () => ({ unexpected: true }))
    const firstActual = { token: {} }
    const secondActual = { token: {} }
    const firstOriginal = jest.fn(async () => firstActual)
    const secondOriginal = jest.fn(async () => secondActual)
    const factory = async (load: () => Promise<Record<string, unknown>>) => {
      const [first, second] = await Promise.all([load(), load()])
      expect(first).toBe(second)
      return first
    }
    registry.register('first', factory, fallback)
    registry.register('second', factory, fallback)
    const [first, second] = await Promise.all([
      registry.resolve('first', firstOriginal),
      registry.resolve('second', secondOriginal),
    ])
    expect(first).toBe(firstActual)
    expect(second).toBe(secondActual)
    expect(firstOriginal).toHaveBeenCalledTimes(1)
    expect(secondOriginal).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
    registry.dispose()
  })

  it('uses registration order before evaluation and rejects later registration', async () => {
    const registry = new MockRegistry()
    const superseded = jest.fn(() => ({ value: 1 }))
    registry.register('target', superseded, original)
    registry.register('target', () => ({ value: 2 }), original)
    expect(await registry.readExport('target', 'value')).toBe(2)
    expect(superseded).not.toHaveBeenCalled()
    expect(() => registry.register('target', superseded, original)).toThrow(
      'after evaluation has started'
    )
  })

  it('keeps original import scoped to its target while dependencies remain mocked', async () => {
    const registry = new MockRegistry()
    registry.register(
      'dependency',
      () => ({ value: 'mock dependency' }),
      original
    )
    registry.register(
      'target',
      async (importOriginal) => ({ ...(await importOriginal()), mocked: true }),
      async () => ({
        dependency: await registry.readExport('dependency', 'value'),
      })
    )
    expect(await registry.resolve('target')).toEqual({
      dependency: 'mock dependency',
      mocked: true,
    })
  })

  it.each([null, undefined, [], 1, () => {}])(
    'rejects invalid factory exports: %p',
    async (value) => {
      const registry = new MockRegistry()
      registry.register('target', () => value as any, original)
      await expect(registry.resolve('target')).rejects.toMatchObject({
        cause: { message: expect.stringContaining('exports object') },
      })
    }
  )

  it('preserves and caches factory failures', async () => {
    const cause = new Error('factory failed')
    const registry = new MockRegistry()
    const factory = jest.fn(() => {
      throw cause
    })
    registry.register('target', factory, original)
    await expect(registry.resolve('target')).rejects.toMatchObject({ cause })
    await expect(registry.resolve('target')).rejects.toMatchObject({ cause })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('distinguishes absent exports from explicitly undefined exports', async () => {
    const registry = new MockRegistry()
    registry.register('target', () => ({ present: undefined }), original)
    expect(await registry.readExport('target', 'present')).toBeUndefined()
    await expect(registry.readExport('target', 'missing')).rejects.toThrow(
      'does not define export "missing"'
    )
    await expect(registry.readExport('target', 'toString')).rejects.toThrow(
      'does not define export'
    )
    expect(() => registry.resolve('unregistered')).toThrow('No module mock')
  })

  it('rejects a pending factory after disposal without leaking into a new realm', async () => {
    let release!: (value: Record<string, unknown>) => void
    const pending = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve
    })
    const registry = new MockRegistry()
    registry.register('target', () => pending, original)
    const result = registry.resolve('target')
    // Let the factory start before disposing its realm.
    await Promise.resolve()
    registry.dispose()
    release({ value: 'stale' })
    await expect(result).rejects.toMatchObject({
      cause: { message: expect.stringContaining('disposed') },
    })
    const fresh = new MockRegistry()
    fresh.register('target', () => ({ value: 'fresh' }), original)
    expect(await fresh.readExport('target', 'value')).toBe('fresh')
  })
})

describe('emitted mock runtime bridge (not compiler conformance)', () => {
  const runtime: typeof import('next/dist/experimental/testing/mocking/runtime') = require('next/dist/experimental/testing/mocking/runtime')

  it('requires file initialization and validates every graph export', async () => {
    await expect(runtime.resolveModuleMock('target', [])).rejects.toThrow(
      'initialized Next-compiled test file'
    )
    const file = runtime.initializeModuleMocking()
    try {
      expect(() => runtime.initializeModuleMocking()).toThrow('already active')
      const factory = jest.fn(async () => ({ present: undefined, value: 42 }))
      runtime.registerModuleMock('target', factory, async () => ({}))
      const [first, second] = await Promise.all([
        runtime.resolveModuleMock('target', ['present', 'value']),
        runtime.resolveModuleMock('target', ['value']),
      ])
      expect(first).toBe(second)
      expect(first.value).toBe(42)
      expect(factory).toHaveBeenCalledTimes(1)
      await expect(
        runtime.resolveModuleMock('target', ['missing'])
      ).rejects.toThrow('does not define export "missing"')
    } finally {
      file.dispose()
    }
  })

  it('attributes pending failures to their disposed file and preserves the next file', async () => {
    let release!: (value: Record<string, unknown>) => void
    const pending = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve
    })
    const onLateFailure = jest.fn()
    const first = runtime.initializeModuleMocking({ onLateFailure })
    runtime.registerModuleMock(
      'target',
      () => pending,
      async () => ({})
    )
    const result = runtime.resolveModuleMock('target', ['value'])
    await Promise.resolve()
    first.dispose()
    const second = runtime.initializeModuleMocking()
    try {
      first.dispose()
      runtime.registerModuleMock(
        'target',
        () => ({ value: 'fresh' }),
        async () => ({})
      )
      release({ value: 'stale' })
      await expect(result).rejects.toMatchObject({
        cause: { message: expect.stringContaining('disposed') },
      })
      expect(onLateFailure).toHaveBeenCalledTimes(1)
      expect(await runtime.resolveModuleMock('target', ['value'])).toEqual({
        value: 'fresh',
      })
    } finally {
      second.dispose()
    }
  })
})

describe('compiled setup input ownership components (not native conformance)', () => {
  const inputs: typeof import('next/dist/experimental/testing/mocking/setup-inputs') = require('next/dist/experimental/testing/mocking/setup-inputs')
  const runtime: typeof import('next/dist/experimental/testing/mocking/runtime') = require('next/dist/experimental/testing/mocking/runtime')

  function host() {
    const context = {
      m: { id: 1 },
      c: new Map<number, { exports: unknown }>(),
      M: new Map([
        [2, () => {}],
        [3, () => {}],
      ]),
    }
    const binding = inputs.initializeCompiledMockInputs(context as any, {
      version: 1,
      inputs: 3,
      aliases: [[2, 3]],
      protected: [1],
    })
    return { context, binding }
  }

  it('preserves the actual first namespace across all native cache readers', () => {
    const { context, binding } = host()
    const exports = { identity: {}, next: jest.fn() }
    const record = { exports }
    try {
      expect(context.c.get(2)).toBeUndefined()
      context.c.set(3, record)
      expect(context.c.get(2)).toBe(record)
      expect(context.c.get(3)).toBe(record)
      expect(context.c.get(2)?.exports).toBe(exports)
      expect([...context.c.values()]).toEqual([record])
      expect(() => context.c.get.call(new Map(), 2)).toThrow(
        'another module cache'
      )
    } finally {
      binding.dispose()
    }
    expect(context.c.get).toBe(Map.prototype.get)
    expect(context.c.get(2)).toBeUndefined()
    expect(context.c.get(3)).toBe(record)
  })

  it.each([
    { aliases: [[2, 3]], protected: [null] },
    { aliases: [[1, 2]], protected: [] },
    {
      aliases: [
        [2, 3],
        [3, 4],
      ],
      protected: [],
    },
  ])('rejects malformed native identity certificates: %p', (manifest) => {
    const context = { m: { id: 1 }, c: new Map(), M: new Map() }
    expect(() =>
      inputs.initializeCompiledMockInputs(
        context as any,
        {
          version: 1,
          inputs: 2,
          ...manifest,
        } as any
      )
    ).toThrow(
      /Invalid (protected mock input module identity|native module aliases)/
    )
    expect(context.c.get).toBe(Map.prototype.get)
    const next = host()
    next.binding.dispose()
  })

  it('keeps the native reader valid while a setup replaces the Map global', () => {
    const { context, binding } = host()
    const NativeMap = Map
    const record = { exports: {} }
    context.c.set(3, record)
    try {
      globalThis.Map = function () {
        throw new Error('setup replacement must not construct a cache')
      } as any
      expect(context.c.get(2)).toBe(record)
    } finally {
      globalThis.Map = NativeMap
      binding.dispose()
    }
  })

  it('rejects a changed native owner and restores the retained cache on disposal', () => {
    const { context, binding } = host()
    const retained = context.c
    context.c = new Map()
    expect(() => retained.get(2)).toThrow('closed or changed')
    expect(() => binding.dispose()).toThrow('owner changed before disposal')
    expect(retained.get).toBe(Map.prototype.get)
    const next = host()
    next.binding.dispose()
  })

  it('permits ordered compiler input registrations while retaining held results', async () => {
    const { binding } = host()
    let first: Record<string, unknown> | undefined
    try {
      await inputs.loadCompiledMockInput(0, async () => {
        runtime.registerModuleMock(
          'target',
          () => ({ value: 1 }),
          async () => ({})
        )
        first = await runtime.resolveModuleMock('target', ['value'])
        expect(() =>
          runtime.registerModuleMock(
            'target',
            () => ({}),
            async () => ({})
          )
        ).toThrow('after evaluation has started')
      })
      await inputs.loadCompiledMockInput(1, async () => {
        runtime.registerModuleMock(
          'target',
          () => ({ value: 2 }),
          async () => ({})
        )
        expect(await runtime.resolveModuleMock('target', ['value'])).toEqual({
          value: 2,
        })
      })
      await inputs.loadCompiledMockInput(2, async () => {
        expect(await runtime.resolveModuleMock('target', ['value'])).toEqual({
          value: 2,
        })
      })
      expect(first).toEqual({ value: 1 })
      expect(() =>
        runtime.registerModuleMock(
          'target',
          () => ({}),
          async () => ({})
        )
      ).toThrow('no live compiled input owner')
      await expect(inputs.loadCompiledMockInput(0, () => {})).rejects.toThrow(
        'repeated'
      )
    } finally {
      binding.dispose()
    }
  })

  it('keeps parallel setup owners independent and closes retained continuations', async () => {
    const { binding } = host()
    let release!: () => void
    let continueAfterClose!: () => void
    let retained: Promise<unknown> | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const later = new Promise<void>((resolve) => {
      continueAfterClose = resolve
    })
    try {
      const first = inputs.loadCompiledMockInput(0, async () => {
        retained = later.then(() => {
          runtime.registerModuleMock(
            'late',
            () => ({}),
            async () => ({})
          )
        })
        await pending
        runtime.registerModuleMock(
          'target',
          () => ({ value: 1 }),
          async () => ({})
        )
      })
      await inputs.loadCompiledMockInput(1, async () => {
        runtime.registerModuleMock(
          'target',
          () => ({ value: 2 }),
          async () => ({})
        )
        expect(await runtime.resolveModuleMock('target', ['value'])).toEqual({
          value: 2,
        })
      })
      await expect(inputs.loadCompiledMockInput(2, () => {})).rejects.toThrow(
        'all setup'
      )
      release()
      await first
      continueAfterClose()
      await expect(retained).rejects.toThrow('no live compiled input owner')
      await inputs.loadCompiledMockInput(2, async () => {
        expect(await runtime.resolveModuleMock('target', ['value'])).toEqual({
          value: 1,
        })
      })
    } finally {
      binding.dispose()
    }
  })

  it('rejects conflicting evaluations and restores ownership during unfinished cleanup', async () => {
    const { context, binding } = host()
    context.c.set(2, { exports: {} })
    context.c.set(3, { exports: {} })
    expect(() => context.c.get(2)).toThrow('duplicate module evaluations')
    let release!: () => void
    const pending = inputs.loadCompiledMockInput(
      0,
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const retainedGet = context.c.get
    expect(() => binding.dispose()).toThrow('unfinished')
    expect(context.c.get).toBe(Map.prototype.get)
    expect(() => retainedGet.call(context.c, 2)).toThrow('closed or changed')
    release()
    await pending
    const next = host()
    next.binding.dispose()
  })
})

describe('compiler-owned runtime mock dispatch components (not native conformance)', () => {
  const dynamic: typeof import('next/dist/experimental/testing/mocking/dynamic') = require('next/dist/experimental/testing/mocking/dynamic')
  const scopes: typeof import('next/dist/experimental/testing/runner/async-context') = require('next/dist/experimental/testing/runner/async-context')
  const imports: typeof import('next/dist/experimental/testing/runner/imports') = require('next/dist/experimental/testing/runner/imports')
  const cache: typeof import('next/dist/experimental/testing/mocking/module-cache') = require('next/dist/experimental/testing/mocking/module-cache')
  function host() {
    let evaluations = 0
    const prototype = {
      i(this: any, id: number) {
        let record = this.c.get(id)
        if (!record) {
          evaluations++
          record = { exports: { value: 1, identity: {} } }
          this.c.set(id, record)
        }
        return record.exports
      },
      A(this: any, id: number) {
        return this.r(id)(prototype.i.bind(this))
      },
      r(id: number) {
        if (id !== 3) throw new Error('unknown test loader')
        return (load: (id: number) => unknown) =>
          Promise.resolve().then(() => load(2))
      },
    }
    const context = Object.assign(Object.create(prototype), {
      m: { id: 1 },
      c: new Map(),
      M: new Map([[2, () => {}]]),
    })
    const tracker = imports.createModuleImportTracker(context)
    const late = jest.fn()
    const originalLoader = prototype.A
    const binding = dynamic.initializeDynamicModuleMocking(
      context,
      {
        version: 1,
        owners: [1],
        targets: [{ id: 2, requests: ['./subject', '././subject'] }],
      },
      { trackImport: tracker.trackImport, onLateFailure: late }
    )
    return {
      context,
      prototype,
      originalLoader,
      tracker,
      binding,
      late,
      evaluations: () => evaluations,
    }
  }
  it.each(['ignored', 'caught'])(
    'preserves actual Node rejection handling for %s imports',
    (mode) => {
      const script = String.raw`
      const path = require('node:path')
      const dynamic = require(process.argv[1])
      const {createModuleImportTracker} = require(path.join(path.dirname(process.argv[1]),'../runner/imports'))
      const errors = []
      const wrappers = []
      const cause = new Error('owned factory rejection')
      process.on('unhandledRejection', error => {
        errors.push(String(error.cause))
        wrappers.push({name:error.name,message:error.message,causeIdentity:error.cause===cause,rawIdentity:error===cause})
      })
      const prototype = {
        i() { throw new Error('actual target evaluated') },
        r() { return load => Promise.resolve().then(() => load(2)) },
        A(id) { return this.r(id)(this.i.bind(this)) },
      }
      const context = Object.assign(Object.create(prototype), {m:{id:1}, c:new Map(), M:new Map([[2,()=>{}]])})
      const tracker = createModuleImportTracker(context)
      const binding = dynamic.initializeDynamicModuleMocking(context,{version:1,owners:[1],targets:[{id:2,requests:['./subject']}]},{trackImport:tracker.trackImport,onLateFailure:error=>errors.push('late:'+String(error))})
      dynamic.doMock('./subject',()=>{throw cause})
      if(process.argv[2] === 'caught') context.A(3).catch(()=>{})
      else void context.A(3)
      ;(async()=>{
        await tracker.waitForImports()
        await new Promise(setImmediate)
        binding.dispose();tracker.dispose()
        process.stdout.write(JSON.stringify({errors,wrappers}))
      })().catch(error=>{console.error(error);process.exitCode=1})
    `
      const { errors, wrappers } = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '-e',
            script,
            require.resolve('next/dist/experimental/testing/mocking/dynamic'),
            mode,
          ],
          { encoding: 'utf8', timeout: 5000 }
        )
      )
      expect(errors).toEqual(
        mode === 'ignored' ? ['Error: owned factory rejection'] : []
      )
      expect(wrappers).toEqual(
        mode === 'ignored'
          ? [
              {
                name: 'Error',
                message:
                  '[vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock',
                causeIdentity: true,
                rawIdentity: false,
              },
            ]
          : []
      )
    }
  )
  it('keeps factories lazy, caches aliases and preserves mocked namespaces through actual reset', async () => {
    const h = host(),
      retire = jest.fn()
    const moduleCache = cache.initializeModuleCache(
      h.context,
      { version: 1, resettable: [2], protected: [1] },
      retire
    )
    try {
      const value = 42,
        factory = jest.fn(() => ({ value }))
      const disposable = dynamic.doMock('./subject', factory)
      expect(factory).not.toHaveBeenCalled()
      const first = await h.context.A(3)
      cache.resetModules()
      const second = await h.context.A(3)
      expect(second).toBe(first)
      expect(first.value).toBe(value)
      expect(factory).toHaveBeenCalledTimes(1)
      expect(h.evaluations()).toBe(0)
      expect(typeof disposable[Symbol.dispose]).toBe('function')
      disposable[Symbol.dispose]!()
      const actual = await h.context.A(3)
      expect(actual.value).toBe(1)
      expect(h.evaluations()).toBe(1)
    } finally {
      moduleCache.dispose()
      h.binding.dispose()
      h.tracker.dispose()
    }
  })
  it('changes only future imports and restores the exact retained actual namespace', async () => {
    const h = host()
    try {
      const actual = await h.context.A(3)
      dynamic.doMock('./subject', () => ({ value: 21 }))
      const first = await h.context.A(3)
      dynamic.doMock('././subject', () => ({ value: 42 }))
      const second = await h.context.A(3)
      expect(second).not.toBe(first)
      expect(first.value).toBe(21)
      expect(second.value).toBe(42)
      dynamic.doUnmock('./subject')
      expect(await h.context.A(3)).toBe(actual)
      expect(h.evaluations()).toBe(1)
    } finally {
      h.binding.dispose()
      h.tracker.dispose()
    }
  })
  it('keeps pending factories visible to actual import settling', async () => {
    const h = host()
    let release!: () => void, started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      dynamic.doMock('./subject', async () => {
        started()
        await pending
        return { value: 42 }
      })
      const value = h.context.A(3)
      await entered
      let settled = false
      const settling = h.tracker.waitForImports().then(() => {
        settled = true
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(settled).toBe(false)
      release()
      expect((await value).value).toBe(42)
      await settling
      expect(settled).toBe(true)
    } finally {
      release()
      h.binding.dispose()
      h.tracker.dispose()
    }
  })
  it('retains a closed originating scope across the real loader callback and factory await', async () => {
    const h = host(),
      late = jest.fn()
    const scope = scopes.createAsyncScope(
      { kind: 'collection', context: { id: 'original', name: 'original' } },
      late
    )
    let release!: () => void, started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      const value = scope.run(() => {
        dynamic.doMock('./subject', async () => {
          started()
          await pending
          return { value: 42 }
        })
        return h.context.A(3)
      })
      const rejected = Promise.resolve(value).catch((error) => error)
      await entered
      scope.close()
      release()
      expect(await rejected).toMatchObject({
        message: expect.stringContaining('closed collection scope'),
      })
      expect(late).toHaveBeenCalled()
      expect(h.evaluations()).toBe(0)
    } finally {
      release()
      h.binding.dispose()
      h.tracker.dispose()
    }
  })
  it('rejects a closed origin before the asynchronous loader callback can start its factory', async () => {
    const h = host(),
      late = jest.fn(),
      factory = jest.fn(() => ({ value: 42 }))
    const scope = scopes.createAsyncScope(
      {
        kind: 'collection',
        context: { id: 'loader-origin', name: 'loader-origin' },
      },
      late
    )
    try {
      const value = scope.run(() => {
        dynamic.doMock('./subject', factory)
        return h.context.A(3)
      })
      scope.close()
      await expect(value).rejects.toThrow('closed collection scope')
      expect(factory).not.toHaveBeenCalled()
      expect(h.evaluations()).toBe(0)
      expect(late).toHaveBeenCalled()
    } finally {
      h.binding.dispose()
      h.tracker.dispose()
    }
  })
  it('delegates foreign importers and restores the original owned loader descriptor', async () => {
    const h = host(),
      original = h.originalLoader
    try {
      dynamic.doMock('./subject', () => ({ value: 42 }))
      const foreign = Object.assign(Object.create(h.prototype), {
        ...h.context,
        m: { id: 99 },
      })
      expect((await foreign.A(3)).value).toBe(1)
      expect((await h.context.A(3)).value).toBe(42)
    } finally {
      h.binding.dispose()
      h.tracker.dispose()
    }
    expect(h.prototype.A).toBe(original)
  })
  it('rejects unowned registration and pending cleanup without borrowing a new file', async () => {
    const h = host()
    let release!: (value: Record<string, unknown>) => void, started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const pending = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve
    })
    expect(() => dynamic.doMock('./unowned', () => ({}))).toThrow(
      'not authorized'
    )
    dynamic.doMock('./subject', () => {
      started()
      return pending
    })
    const value = h.context.A(3)
    const rejected = Promise.resolve(value).catch((error) => error)
    await entered
    expect(() => h.binding.dispose()).toThrow('cancelled')
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('cancelled'),
    })
    h.tracker.dispose()
    const fresh = host()
    try {
      release({ value: 'stale' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(h.late).toHaveBeenCalled()
      expect(fresh.late).not.toHaveBeenCalled()
      dynamic.doMock('./subject', () => ({ value: 'fresh' }))
      expect((await fresh.context.A(3)).value).toBe('fresh')
    } finally {
      fresh.binding.dispose()
      fresh.tracker.dispose()
    }
  })
  it.each(['resolve', 'reject'])(
    'keeps replaced pending %s work in its disposed owner',
    async (mode) => {
      const h = host()
      let start!: () => void
      let release!: (value: Record<string, unknown>) => void
      let reject!: (error: Error) => void
      let reportLate!: () => void
      const started = new Promise<void>((resolve) => {
        start = resolve
      })
      const reported = new Promise<void>((resolve) => {
        reportLate = resolve
      })
      const held = new Promise<Record<string, unknown>>((resolve, fail) => {
        release = resolve
        reject = fail
      })
      h.late.mockImplementation(reportLate)
      const replacement = jest.fn(() => ({ value: 'old replacement' }))
      dynamic.doMock('./subject', () => {
        start()
        return held
      })
      const result = h.context.A(3).catch((error: Error) => error)
      await started
      dynamic.doMock('./subject', replacement)
      expect(() => h.binding.dispose()).toThrow('cancelled during file cleanup')
      expect(await result).toMatchObject({
        message: expect.stringContaining('cancelled during file cleanup'),
      })
      h.tracker.dispose()
      const fresh = host()
      try {
        const factory = jest.fn(() => ({ value: 'fresh' }))
        dynamic.doMock('./subject', factory)
        const first = await fresh.context.A(3)
        if (mode === 'resolve') release({ value: 'stale' })
        else reject(new RangeError('disposed replacement raw'))
        await reported
        expect(await fresh.context.A(3)).toBe(first)
        expect(first.value).toBe('fresh')
        expect(factory).toHaveBeenCalledTimes(1)
        expect(replacement).not.toHaveBeenCalled()
        expect(h.late).toHaveBeenCalledTimes(1)
        expect(fresh.late).not.toHaveBeenCalled()
        expect(h.evaluations()).toBe(0)
        expect(fresh.evaluations()).toBe(0)
      } finally {
        fresh.binding.dispose()
        fresh.tracker.dispose()
      }
    }
  )
})

describe('compiler importMock runtime selections (not native compiler conformance)', () => {
  const runtime: typeof import('next/dist/experimental/testing/mocking/runtime') = require('next/dist/experimental/testing/mocking/runtime')

  it('caches factory namespace identity without deep-mocking factory values', async () => {
    const file = runtime.initializeModuleMocking()
    const plain = () => 'plain'
    const fn = jest.fn(() => 'mock')
    const factory = jest.fn(() => ({ plain, fn, explicit: undefined }))
    try {
      runtime.registerModuleMock('resolved:factory', factory, async () => ({}))
      const raw = await runtime.resolveModuleMock('resolved:factory', [])
      const first = await runtime.importModuleMock('resolved:factory')
      const second = await runtime.importModuleMock('resolved:factory')
      expect(first).toBe(second)
      expect(first).not.toBe(raw)
      expect(first.plain).toBe(plain)
      expect(first.fn).toBe(fn)
      expect(jest.isMockFunction(first.plain)).toBe(false)
      expect(first.explicit).toBeUndefined()
      expect(() => first.absent).toThrow('does not define export "absent"')
      expect(Reflect.get(first, Symbol.toStringTag)).toBeUndefined()
      expect(factory).toHaveBeenCalledTimes(1)
    } finally {
      file.dispose()
    }
  })

  it('retains redirect identity and creates each unregistered transform freshly', async () => {
    const file = runtime.initializeModuleMocking()
    const original = { value: 'actual' }
    const load = jest.fn(async () => original)
    const transform = jest.fn((module) => ({ ...module, mock: jest.fn() }))
    try {
      expect(await runtime.importModuleMock(load)).toBe(original)
      expect(await runtime.importModuleMock(load)).toBe(original)
      const first = await runtime.importModuleMock(load, transform)
      const second = await runtime.importModuleMock(load, transform)
      expect(first).not.toBe(second)
      expect(first.mock).not.toBe(second.mock)
      expect(original).toEqual({ value: 'actual' })
      expect(transform).toHaveBeenCalledTimes(2)
      await expect(
        runtime.resolveModuleMock('unregistered', [])
      ).rejects.toThrow('No module mock')
    } finally {
      file.dispose()
    }
  })

  it('rejects an old pending original before transforming in a later file', async () => {
    let release!: (value: Record<string, unknown>) => void
    const pending = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve
    })
    const oldLate = jest.fn()
    const old = runtime.initializeModuleMocking({ onLateFailure: oldLate })
    const transform = jest.fn((module) => module)
    const result = runtime.importModuleMock(() => pending, transform)
    const rejected = result.catch((error) => error)
    old.dispose()
    const freshLate = jest.fn()
    const fresh = runtime.initializeModuleMocking({ onLateFailure: freshLate })
    try {
      release({ value: 'stale' })
      expect(await rejected).toMatchObject({
        message: expect.stringContaining('disposed'),
      })
      expect(transform).not.toHaveBeenCalled()
      expect(oldLate).toHaveBeenCalledTimes(1)
      expect(freshLate).not.toHaveBeenCalled()
      expect(
        await runtime.importModuleMock(async () => ({ value: 'fresh' }))
      ).toEqual({ value: 'fresh' })
    } finally {
      fresh.dispose()
    }
  })

  it('retains held setup namespaces and refreshes only a successfully replaced target', async () => {
    let input = { index: 0, closed: false, evaluating: false }
    const file = runtime.initializeModuleMocking({
      registrationInput: () => input,
    })
    try {
      runtime.registerModuleMock(
        'shared:target',
        () => ({ value: 'setup' }),
        async () => ({})
      )
      const held = await runtime.importModuleMock('shared:target')
      input.closed = true
      input = { index: 1, closed: false, evaluating: false }
      runtime.registerModuleMock(
        'shared:target',
        () => ({ value: 'spec' }),
        async () => ({})
      )
      const current = await runtime.importModuleMock('shared:target')
      expect(current).not.toBe(held)
      expect(held.value).toBe('setup')
      expect(current.value).toBe('spec')
      expect(await runtime.importModuleMock('shared:target')).toBe(current)
      expect(() =>
        runtime.registerModuleMock(
          'shared:target',
          () => ({}),
          async () => ({})
        )
      ).toThrow('after evaluation')
      expect(await runtime.importModuleMock('shared:target')).toBe(current)
    } finally {
      file.dispose()
    }
  })
})

describe('importMock pending setup factory replacement', () => {
  const runtime: typeof import('next/dist/experimental/testing/mocking/runtime') = require('next/dist/experimental/testing/mocking/runtime')

  it('retains each pending result and caches the late setup namespace like Vitest', async () => {
    let input = { index: 0, closed: false, evaluating: false }
    const file = runtime.initializeModuleMocking({
      registrationInput: () => input,
    })
    let begin!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      begin = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const setup = { value: 'setup', token: {} }
    const spec = { value: 'spec', token: {} }
    const setupFactory = jest.fn(async () => {
      begin()
      await gate
      return setup
    })
    const specFactory = jest.fn(() => spec)
    runtime.registerModuleMock('shared:pending', setupFactory, async () => ({}))
    const pending = runtime.importModuleMock('shared:pending')
    try {
      await started
      input.closed = true
      input = { index: 1, closed: false, evaluating: false }
      runtime.registerModuleMock(
        'shared:pending',
        specFactory,
        async () => ({})
      )
      const before = await runtime.importModuleMock('shared:pending')
      const beforeAgain = await runtime.importModuleMock('shared:pending')
      release()
      const held = await pending
      const after = await runtime.importModuleMock('shared:pending')
      const afterAgain = await runtime.importModuleMock('shared:pending')
      const raw = {
        beforeValue: before.value,
        heldValue: held.value,
        afterValue: after.value,
        beforeAgain: before === beforeAgain,
        beforeHeld: before === held,
        beforeAfter: before === after,
        heldAfter: held === after,
        afterAgain: after === afterAgain,
        beforeSpecToken: before.token === spec.token,
        heldSetupToken: held.token === setup.token,
        afterSpecToken: after.token === spec.token,
        setupCalls: setupFactory.mock.calls.length,
        specCalls: specFactory.mock.calls.length,
        assertionCallsBefore: expect.getState().assertionCalls,
      }
      expect(raw).toEqual({
        beforeValue: 'spec',
        heldValue: 'setup',
        afterValue: 'setup',
        beforeAgain: true,
        beforeHeld: false,
        beforeAfter: false,
        heldAfter: true,
        afterAgain: true,
        beforeSpecToken: true,
        heldSetupToken: true,
        afterSpecToken: false,
        setupCalls: 1,
        specCalls: 1,
        assertionCallsBefore: 0,
      })
    } finally {
      release()
      await pending.catch(() => {})
      file.dispose()
    }
  })
})

describe('Browser stamped-original cache components (not native compiler conformance)', () => {
  type FreshModule =
    typeof import('next/dist/experimental/testing/mocking/fresh-module')
  type Context =
    import('next/dist/experimental/testing/mocking/fresh-module').BrowserMockContext
  type Loader =
    import('next/dist/experimental/testing/mocking/fresh-module').BrowserMockOriginalLoader

  function moduleAtClock(clock: () => number): FreshModule {
    const descriptor = Object.getOwnPropertyDescriptor(Date, 'now')!
    let fresh!: FreshModule
    try {
      Object.defineProperty(Date, 'now', { ...descriptor, value: clock })
      jest.isolateModules(() => {
        fresh = require('next/dist/experimental/testing/mocking/fresh-module')
      })
    } finally {
      Object.defineProperty(Date, 'now', descriptor)
    }
    return fresh
  }

  // This host models only the native M/c/i contracts for the component. Real
  // factory/chunk/TLA behavior is separately exercised by Browser CLI consumers.
  function host(
    factory: (
      context: Context
    ) => Record<string, unknown> | Promise<Record<string, unknown>> | void
  ) {
    const root = 'actual-root'
    const parent = { id: 'adapter', parents: [], children: [] } as any
    const canonical = (context: Context) => {
      const value = factory(context)
      if (value instanceof Promise) {
        context.a((_dependencies: unknown, done: (error?: unknown) => void) => {
          void value.then((exports) => {
            Object.assign(context.e, exports)
            done()
          }, done)
        }, true)
      } else if (value !== undefined) {
        Object.assign(context.e, value)
        context.n(context.e)
      }
    }
    const M = new Map<string | number, Function>([[root, canonical]])
    const c = new Map<string | number, any>([['adapter', parent]])
    const prototype = {
      M,
      c,
      F(path: string, name?: string) {
        return `file:///${name ?? 'ROOT'}/${path}`
      },
      n(this: Context, namespace: Record<string, unknown>) {
        this.m.exports = this.m.namespaceObject = namespace
      },
      a(this: Context, body: Function) {
        let value: unknown = this.e
        let resolve!: (value: unknown) => void,
          reject!: (error: unknown) => void
        const promise = new Promise((yes, no) => {
          resolve = yes
          reject = no
        })
        const attributes = {
          get: () => promise,
          set: (next: unknown) => {
            value = next
          },
        }
        Object.defineProperty(this.m, 'exports', attributes)
        Object.defineProperty(this.m, 'namespaceObject', attributes)
        body(
          () => [],
          (error?: unknown) => (error ? reject(error) : resolve(value))
        )
      },
      i(this: Context, id: string | number) {
        this.m.children.push(id)
        let record = c.get(id)
        if (record) {
          if (!record.parents.includes(this.m.id))
            record.parents.push(this.m.id)
          if (record.error) throw record.error
          return record.exports
        }
        record = { id, parents: [this.m.id], children: [], exports: {} }
        c.set(id, record)
        const context = Object.assign(Object.create(prototype), {
          m: record,
          e: record.exports,
        })
        try {
          Reflect.apply(M.get(id)!, undefined, [context])
          return record.namespaceObject ?? record.exports
        } catch (error) {
          record.error = error
          throw error
        }
      },
    }
    const context = Object.assign(Object.create(prototype), {
      m: parent,
    }) as Context
    const load: Loader = async (evaluate) =>
      evaluate(context, root, 'subject.mjs')
    return { root, parent, M, c, context, load }
  }

  it('caches each target/stamp/type inner result while producing fresh outer containers', async () => {
    let stamp = 10
    const fresh = moduleAtClock(() => stamp)
    let runs = 0
    const h = host((context) => ({
      fn: () => ++runs,
      url: context.F('subject.mjs'),
      heldURL: () => context.F('subject.mjs'),
      otherURL: context.F('other.mjs'),
    }))
    const transforms: boolean[] = []
    const mock = (value: any, options?: { spy?: boolean }): any => {
      transforms.push(!!options?.spy)
      return {
        ...value,
        fn: value.fn.mocked
          ? value.fn
          : Object.assign(() => undefined, { mocked: true }),
      }
    }
    const capture = jest.fn(() => mock)
    const state = fresh.createFreshModuleMocking(capture)
    const original = h.M.get(h.root)
    try {
      const [a, b] = await Promise.all([
        state.importMock(h.load),
        state.importMock(h.load),
      ])
      expect(a).not.toBe(b)
      expect(a.fn).toBe(b.fn)
      expect(a.url).toBe('file:///ROOT/subject.mjs?t=10&mock=automock')
      expect((a.heldURL as Function)()).toBe(a.url)
      expect(a.otherURL).toBe('file:///ROOT/other.mjs')
      expect(h.context.F('subject.mjs')).toBe('file:///ROOT/subject.mjs')
      expect(h.M.get(h.root)).toBe(original)
      expect(transforms).toEqual([false, false, false])
      expect(capture).toHaveBeenCalledTimes(2)
      const spy = await state.importMock(h.load, { spy: true })
      expect(spy.fn).not.toBe(a.fn)
      stamp++
      const later = await state.importMock(h.load)
      expect(later.fn).not.toBe(a.fn)
      expect(later.url).toBe('file:///ROOT/subject.mjs?t=11&mock=automock')
      expect(h.c.size).toBe(4)
    } finally {
      state.dispose()
    }
    expect(h.c.size).toBe(1)
    expect([...h.M.keys()]).toEqual([h.root])
    expect(h.parent.children).toEqual([])
    expect(runs).toBe(0)
  })

  it('retains same-stamp rejection identity and retries the actual root at another stamp', async () => {
    let stamp = 20
    const fresh = moduleAtClock(() => stamp)
    const failures: Error[] = []
    const h = host(() => {
      const failure = new TypeError('ordinary root failure')
      failures.push(failure)
      throw failure
    })
    const materialize = jest.fn((value) => value)
    const state = fresh.createFreshModuleMocking(() => materialize)
    try {
      const results = await Promise.allSettled([
        state.importMock(h.load),
        state.importMock(h.load),
        state.importMock(h.load),
      ])
      expect(results).toHaveLength(3)
      for (const result of results) {
        expect(result.status).toBe('rejected')
        expect((result as PromiseRejectedResult).reason).toBe(failures[0])
      }
      expect(failures).toHaveLength(1)
      stamp++
      const later = await state.importMock(h.load).catch((error) => error)
      expect(later).toBe(failures[1])
      expect(failures).toHaveLength(2)
      expect(failures[1]).not.toBe(failures[0])
      expect(materialize).not.toHaveBeenCalled()
    } finally {
      state.dispose()
    }
    expect(h.c.size).toBe(1)
  })

  it('captures the native clock at module initialization rather than later public Date.now', async () => {
    const captured = jest.fn(() => 30)
    const fresh = moduleAtClock(captured)
    const h = host((context) => ({ url: context.F('subject.mjs') }))
    const state = fresh.createFreshModuleMocking(() => (value) => ({
      ...value,
    }))
    const descriptor = Object.getOwnPropertyDescriptor(Date, 'now')!
    const late = jest.fn(() => 100)
    let value: Record<string, unknown>
    let lateCalls: number
    try {
      Object.defineProperty(Date, 'now', { ...descriptor, value: late })
      value = await state.importMock(h.load)
      lateCalls = late.mock.calls.length
    } finally {
      Object.defineProperty(Date, 'now', descriptor)
      state.dispose()
    }
    expect(value!.url).toBe('file:///ROOT/subject.mjs?t=30&mock=automock')
    expect(captured).toHaveBeenCalledTimes(1)
    expect(lateCalls!).toBe(0)
  })

  it('does not drain unfinished roots and removes only their alias after actual settlement', async () => {
    const fresh = moduleAtClock(() => 40)
    let begin!: () => void, release!: () => void
    const started = new Promise<void>((resolve) => {
      begin = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = host(async () => {
      begin()
      await gate
      return { value: 'late' }
    })
    let alive = true
    const state = fresh.createFreshModuleMocking(() => (value) => {
      if (!alive) throw new Error('original file disposed')
      return { ...value }
    })
    const result = state.importMock(h.load).catch((error) => error)
    await started
    const alias = [...h.M.keys()].find((id) => id !== h.root)!
    alive = false
    state.dispose()
    expect(h.M.has(alias)).toBe(true)
    expect(h.c.has(alias)).toBe(true)
    release()
    expect(await result).toMatchObject({ message: 'original file disposed' })
    expect(h.M.has(alias)).toBe(false)
    expect(h.c.has(alias)).toBe(false)
    expect(h.M.has(h.root)).toBe(true)
    expect(h.parent.children).toEqual([])
  })

  it('does not evaluate a chunk that finishes loading after its file is disposed', async () => {
    const fresh = moduleAtClock(() => 50)
    const factory = jest.fn(() => ({ value: 1 }))
    const h = host(factory)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const loader: Loader = async (evaluate) => {
      await gate
      return h.load(evaluate)
    }
    const state = fresh.createFreshModuleMocking(() => (value) => value)
    const result = state.importMock(loader).catch((error) => error)
    state.dispose()
    release()
    expect(await result).toMatchObject({
      message: expect.stringContaining('disposed'),
    })
    expect(factory).not.toHaveBeenCalled()
    expect([...h.M.keys()]).toEqual([h.root])
    expect(h.c.size).toBe(1)
  })

  it.each([false, true])(
    'automocks an exported then before native import assimilation (async=%s)',
    async (asynchronous) => {
      const fresh = moduleAtClock(() => 60)
      const events: string[] = []
      let begin!: () => void, release!: () => void, assimilated!: () => void
      const started = new Promise<void>((resolve) => {
        begin = resolve
      })
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const mockedThenCalled = new Promise<void>((resolve) => {
        assimilated = resolve
      })
      const exports = {
        then(resolve: (value: unknown) => void) {
          events.push('raw-then')
          resolve({ unexpected: true })
        },
      }
      const h = host((context) => {
        events.push('root-start')
        begin()
        if (!asynchronous) return exports
        context.a((_dependencies: unknown, done: (error?: unknown) => void) => {
          void gate.then(() => {
            events.push('root-end')
            Object.assign(context.e, exports)
            done()
          }, done)
        }, true)
      })
      const mockThen = jest.fn(() => {
        assimilated()
      })
      const state = fresh.createFreshModuleMocking(() => (value) => ({
        ...value,
        then: mockThen,
      }))
      const pending = state.importMock(h.load)
      void pending.then(
        () => {
          events.push('fulfilled')
        },
        () => {
          events.push('rejected')
        }
      )
      try {
        await started
        if (asynchronous) {
          expect(events).toEqual(['root-start'])
          release()
        }
        await mockedThenCalled
        expect(events).toEqual(
          asynchronous ? ['root-start', 'root-end'] : ['root-start']
        )
        expect(mockThen).toHaveBeenCalledTimes(1)
        state.dispose()
        // The actual import promise is still pending on the mocked `then`.
        // Keep this alias until real settlement or the real Browser realm closes.
        expect(h.c.size).toBe(2)
        expect(h.M.size).toBe(2)
        expect(h.M.has(h.root)).toBe(true)
        expect(events).toEqual(
          asynchronous ? ['root-start', 'root-end'] : ['root-start']
        )
      } finally {
        release()
        state.dispose()
      }
    }
  )
})

describe('native runtime manifest ownership schema', () => {
  const dynamic: typeof import('next/dist/experimental/testing/mocking/dynamic') = require('next/dist/experimental/testing/mocking/dynamic')
  const cache: typeof import('next/dist/experimental/testing/mocking/module-cache') = require('next/dist/experimental/testing/mocking/module-cache')
  function context() {
    const prototype = {
      i(this: any, id: number) {
        let record = this.c.get(id)
        if (!record) {
          record = { exports: { value: 19 } }
          this.c.set(id, record)
        }
        return record.exports
      },
      r() {
        return (load: (id: number) => unknown) =>
          Promise.resolve().then(() => load(2))
      },
      A(this: any, id: number) {
        return this.r(id)(this.i.bind(this))
      },
    }
    return Object.assign(Object.create(prototype), {
      m: { id: 1 },
      c: new Map(),
      M: new Map([
        [2, () => {}],
        [3, () => {}],
      ]),
    })
  }
  const options = () => ({ trackImport: jest.fn(), onLateFailure: jest.fn() })
  it.each(['commonjs', 'esm'])(
    'retains the %s native schema without evaluating targets',
    async (kind) => {
      const host = context()
      const cacheOwner = cache.initializeModuleCache(
        host,
        { version: 1, resettable: [2, 3], protected: [1] },
        () => {}
      )
      const manifest = JSON.parse(
        JSON.stringify({
          version: 1,
          owners: [1],
          targets: [
            {
              id: 2,
              aliases: [3],
              requests: ['package'],
              nativeOriginal: kind,
            },
          ],
        })
      )
      const encoded = JSON.stringify(manifest)
      const binding = dynamic.initializeDynamicModuleMocking(
        host,
        manifest,
        options()
      )
      try {
        expect(host.c.size).toBe(0)
        const factory = jest.fn(() => ({ value: 73 }))
        dynamic.doMock('package', factory)
        expect(factory).not.toHaveBeenCalled()
        expect(await host.A(4)).toEqual({ value: 73 })
        expect(factory).toHaveBeenCalledTimes(1)
        expect(host.c.size).toBe(0)
        expect(JSON.stringify(manifest)).toBe(encoded)
      } finally {
        binding.dispose()
        cacheOwner.dispose()
      }
    }
  )
  it.each([null, 'cjs', '', 1, {}])(
    'rejects an invalid native kind %p',
    (kind) => {
      const host = context()
      const cacheOwner = cache.initializeModuleCache(
        host,
        { version: 1, resettable: [2, 3], protected: [1] },
        () => {}
      )
      try {
        expect(() =>
          dynamic.initializeDynamicModuleMocking(
            host,
            {
              version: 1,
              owners: [1],
              targets: [{ id: 2, requests: ['package'], nativeOriginal: kind }],
            } as any,
            options()
          )
        ).toThrow('Invalid runtime mock target identity')
        expect(host.c.size).toBe(0)
      } finally {
        cacheOwner.dispose()
      }
    }
  )
  it.each([
    { id: 99, requests: ['package'], nativeOriginal: 'commonjs' },
    { id: 2, aliases: [99], requests: ['package'], nativeOriginal: 'esm' },
  ])('rejects a foreign native target or alias %p', (target) => {
    const host = context()
    const cacheOwner = cache.initializeModuleCache(
      host,
      { version: 1, resettable: [2, 3], protected: [1] },
      () => {}
    )
    try {
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          host,
          { version: 1, owners: [1], targets: [target] } as any,
          options()
        )
      ).toThrow('not owned by this module cache')
      expect(host.c.size).toBe(0)
    } finally {
      cacheOwner.dispose()
    }
  })
  it('rejects another active cache owner even when maps and target IDs match', () => {
    const host = context()
    const cacheOwner = cache.initializeModuleCache(
      host,
      { version: 1, resettable: [2, 3], protected: [1] },
      () => {}
    )
    const foreign = Object.assign(
      Object.create(Object.getPrototypeOf(host)),
      host
    )
    try {
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          foreign,
          {
            version: 1,
            owners: [1],
            targets: [
              { id: 2, requests: ['package'], nativeOriginal: 'commonjs' },
            ],
          },
          options()
        )
      ).toThrow('not owned by this module cache')
      expect(host.c.size).toBe(0)
    } finally {
      cacheOwner.dispose()
    }
  })
  it.each([
    { id: 1, requests: ['package'], nativeOriginal: 'esm' },
    { id: 2, aliases: [1], requests: ['package'], nativeOriginal: 'commonjs' },
  ])('rejects native owner and alias overlap %p', (target) => {
    const host = context()
    const cacheOwner = cache.initializeModuleCache(
      host,
      { version: 1, resettable: [2, 3], protected: [1] },
      () => {}
    )
    try {
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          host,
          { version: 1, owners: [1], targets: [target] } as any,
          options()
        )
      ).toThrow(/Invalid runtime mock (target identity|part ownership)/)
      expect(host.c.size).toBe(0)
    } finally {
      cacheOwner.dispose()
    }
  })
  it('round-trips the unchanged compiled manifest without a native cache owner', async () => {
    const host = context()
    const manifest = JSON.parse(
      '{"version":1,"owners":[1],"targets":[{"id":2,"aliases":[3],"requests":["./subject"]}]}'
    )
    const encoded = JSON.stringify(manifest)
    const binding = dynamic.initializeDynamicModuleMocking(
      host,
      manifest,
      options()
    )
    try {
      dynamic.doMock('./subject', () => ({ value: 73 }))
      expect(await host.A(4)).toEqual({ value: 73 })
      expect(JSON.stringify(manifest)).toBe(encoded)
      expect(manifest.targets[0]).not.toHaveProperty('nativeOriginal')
    } finally {
      binding.dispose()
    }
  })
  it('keeps the exact static namespace protected while runtime providers and registrations change', async () => {
    const host = context()
    const initial = Object.assign(Object.create(null), { value: 5 })
    host.c.set(3, { exports: initial })
    const cacheOwner = cache.initializeModuleCache(
      host,
      {
        version: 1,
        resettable: [2],
        protected: [1, 3],
        staticMocks: [{ initial: 3, provider: 2 }],
      },
      () => {}
    )
    const manifest = {
      version: 1,
      owners: [1],
      targets: [
        {
          id: 2,
          requests: ['package'],
          nativeOriginal: 'commonjs',
          staticMock: { initial: 3, provider: 2 },
        },
      ],
    } as const
    const encoded = JSON.stringify(manifest)
    const binding = dynamic.initializeDynamicModuleMocking(
      host,
      manifest,
      options()
    )
    try {
      expect(await host.A(4)).toBe(initial)
      let original: unknown
      const factory = jest.fn(
        async (load: () => Promise<Record<string, unknown>>) => {
          original = await load()
          return { value: 73 }
        }
      )
      dynamic.doMock('package', factory)
      expect(factory).not.toHaveBeenCalled()
      const mocked = await host.A(4)
      cache.resetModules()
      expect(await host.A(4)).toBe(mocked)
      expect(host.c.get(3).exports).toBe(initial)
      expect(factory).toHaveBeenCalledTimes(1)
      dynamic.doUnmock('package')
      const released = await host.A(4)
      expect(released).not.toBe(initial)
      expect(released).not.toBe(original)
      expect(released).toEqual({ value: 19 })
      cache.resetModules()
      const afterReset = await host.A(4)
      expect(afterReset).not.toBe(released)
      expect(afterReset).not.toBe(initial)
      expect(initial.value).toBe(5)
      expect(JSON.stringify(manifest)).toBe(encoded)
    } finally {
      binding.dispose()
      cacheOwner.dispose()
    }
  })

  it.each([
    null,
    {},
    [{ initial: 2, provider: 2 }],
    [{ initial: 1, provider: 2 }],
    [{ initial: 99, provider: 2 }],
    [{ initial: 3, provider: 99 }],
    [
      { initial: 3, provider: 2 },
      { initial: 3, provider: 2 },
    ],
    [{ initial: 2, provider: 3 }],
    [{ initial: 4, provider: 2 }],
  ])(
    'rejects malformed or foreign compiler cache pair records %p without evaluation',
    (staticMocks) => {
      const host = context()
      const evaluate = jest.fn()
      host.M.set(2, evaluate)
      expect(() =>
        cache.initializeModuleCache(
          host,
          {
            version: 1,
            resettable: [2],
            protected: [1, 3, 4],
            staticMocks,
          } as any,
          () => {}
        )
      ).toThrow('Invalid compiler-owned static mock pairs')
      expect(evaluate).not.toHaveBeenCalled()
      expect(host.c.size).toBe(0)
    }
  )

  it.each([
    null,
    'pair',
    [],
    { initial: 2, provider: 2 },
    { initial: 1, provider: 2 },
    { initial: 99, provider: 2 },
    { initial: 3, provider: 99 },
    { initial: 4, provider: 2 },
  ])(
    'rejects unissued runtime namespace/provider pairs %p without evaluation',
    (staticMock) => {
      const host = context()
      host.M.set(4, () => {})
      const cacheOwner = cache.initializeModuleCache(
        host,
        {
          version: 1,
          resettable: [2],
          protected: [1, 3, 4],
          staticMocks: [{ initial: 3, provider: 2 }],
        },
        () => {}
      )
      try {
        expect(() =>
          dynamic.initializeDynamicModuleMocking(
            host,
            {
              version: 1,
              owners: [1],
              targets: [
                {
                  id: 2,
                  requests: ['package'],
                  nativeOriginal: 'commonjs',
                  staticMock,
                },
              ],
            } as any,
            options()
          )
        ).toThrow(
          /Invalid runtime static mock pair identity|not owned by this module cache/
        )
        expect(host.c.size).toBe(0)
      } finally {
        cacheOwner.dispose()
      }
    }
  )

  it('rejects a protected initial namespace reused as another runtime target', () => {
    const host = context()
    const cacheOwner = cache.initializeModuleCache(
      host,
      {
        version: 1,
        resettable: [2],
        protected: [1, 3],
        staticMocks: [{ initial: 3, provider: 2 }],
      },
      () => {}
    )
    try {
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          host,
          {
            version: 1,
            owners: [1],
            targets: [
              {
                id: 2,
                requests: ['package'],
                nativeOriginal: 'commonjs',
                staticMock: { initial: 3, provider: 2 },
              },
              { id: 3, requests: ['./other'] },
            ],
          },
          options()
        )
      ).toThrow('Runtime static namespaces overlap target groups')
      expect(host.c.size).toBe(0)
    } finally {
      cacheOwner.dispose()
    }
  })
})

describe('compiler-certified static runtime import edge components', () => {
  const dynamic: typeof import('next/dist/experimental/testing/mocking/dynamic') = require('next/dist/experimental/testing/mocking/dynamic')
  const cache: typeof import('next/dist/experimental/testing/mocking/module-cache') = require('next/dist/experimental/testing/mocking/module-cache')
  function host(
    staticImports: unknown = [{ owner: 4, target: 2 }],
    target: object = { id: 2, requests: ['./subject'] },
    cacheIds = [1, 2, 4]
  ) {
    const original = { value: 'original' }
    const prototype = {
      i(this: any, id: number) {
        return id === 2 ? original : { id }
      },
      A(this: any, id: number) {
        return this.r(id)((target: number) => this.i(target))
      },
      r() {
        return (load: (id: number) => unknown) =>
          Promise.resolve().then(() => load(2))
      },
    }
    const context = Object.assign(Object.create(prototype), {
      m: { id: 0 },
      c: new Map(),
      M: new Map([1, 2, 4, 5].map((id) => [id, () => {}])),
    })
    const cacheOwner = cache.initializeModuleCache(
      context,
      { version: 1, resettable: cacheIds, protected: [] },
      () => {}
    )
    const manifest = {
      version: 1,
      owners: [1],
      targets: [target],
      ...(staticImports === 'absent' ? {} : { staticImports }),
    }
    const options = { trackImport() {}, onLateFailure() {} }
    const before = Object.getOwnPropertyDescriptor(prototype, 'i')
    let binding: ReturnType<typeof dynamic.initializeDynamicModuleMocking>
    try {
      binding = dynamic.initializeDynamicModuleMocking(
        context,
        manifest as any,
        options
      )
    } catch (error) {
      cacheOwner.dispose()
      throw error
    }
    const importer = (id: number) =>
      Object.assign(Object.create(prototype), {
        m: { id },
        c: context.c,
        M: context.M,
      })
    return {
      context,
      prototype,
      original,
      before,
      binding,
      cacheOwner,
      entry: importer(1),
      consumer: importer(4),
      foreign: importer(5),
    }
  }
  it('selects the exact completed factory exports only at a certified static edge and restores its descriptor', async () => {
    const h = host()
    try {
      expect(h.consumer.i(2)).toBe(h.original)
      const value = { value: 'mock' }
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const factory = jest.fn(async () => {
        await gate
        return value
      })
      dynamic.doMock('./subject', factory)
      const pending = h.entry.A(3)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(factory).toHaveBeenCalledTimes(1)
      expect(h.consumer.i(2)).toBe(h.original)
      release()
      expect(await pending).toBe(value)
      expect(h.consumer.i(2)).toBe(value)
      expect(h.foreign.i(2)).toBe(h.original)
      expect(h.consumer.i(5)).toEqual({ id: 5 })
      cache.resetModules()
      expect(h.consumer.i(2)).toBe(value)
      dynamic.doUnmock('./subject')
      expect(h.consumer.i(2)).toBe(h.original)
      expect(factory).toHaveBeenCalledTimes(1)
    } finally {
      h.binding.dispose()
      h.cacheOwner.dispose()
    }
    expect(Object.getOwnPropertyDescriptor(h.prototype, 'i')).toEqual(h.before)
  })
  it('leaves the original static import method and descriptor exact when edges are absent', () => {
    const h = host('absent')
    try {
      expect(Object.getOwnPropertyDescriptor(h.prototype, 'i')).toEqual(
        h.before
      )
    } finally {
      h.binding.dispose()
      h.cacheOwner.dispose()
    }
  })
  it.each([
    null,
    [],
    {},
    [{ owner: 4, target: 99 }],
    [{ owner: 99, target: 2 }],
    [{ owner: 1, target: 2 }],
    [{ owner: 2, target: 2 }],
    [
      { owner: 4, target: 2 },
      { owner: 4, target: 2 },
    ],
    [{ owner: '', target: 2 }],
    [{ owner: 4, target: -1 }],
  ])(
    'rejects malformed, foreign, entry or duplicate exact static edges %p',
    (edges) => {
      expect(() => host(edges)).toThrow(
        /Invalid runtime static import|not owned by this module cache/
      )
    }
  )
  it('rejects a native target on a compiled static edge', () => {
    expect(() =>
      host([{ owner: 4, target: 2 }], {
        id: 2,
        requests: ['./subject'],
        nativeOriginal: 'commonjs',
      })
    ).toThrow('Invalid runtime static import edge identity')
  })
  it('rejects a protected consumer without evaluating any factory', () => {
    expect(() => host([{ owner: 4, target: 2 }], undefined, [1, 2])).toThrow(
      'not owned by this module cache'
    )
  })
  it('retains static importer ownership during cleanup', () => {
    const h = host()
    h.prototype.i = () => ({ value: 'foreign' })
    try {
      expect(() => h.binding.dispose()).toThrow(
        'Runtime static import ownership changed before disposal'
      )
    } finally {
      h.cacheOwner.dispose()
    }
  })
  it('rejects a different active cache owner even with the same actual maps and edge IDs', () => {
    const h = host('absent')
    h.binding.dispose()
    const foreign = Object.assign(Object.create(h.prototype), h.context)
    try {
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          foreign,
          {
            version: 1,
            owners: [1],
            targets: [{ id: 2, requests: ['./subject'] }],
            staticImports: [{ owner: 4, target: 2 }],
          },
          { trackImport() {}, onLateFailure() {} }
        )
      ).toThrow('not owned by this module cache')
      expect(Object.getOwnPropertyDescriptor(h.prototype, 'i')).toEqual(
        h.before
      )
      expect(h.context.c.size).toBe(0)
    } finally {
      h.cacheOwner.dispose()
    }
  })
})

describe('compiler-certified ordered runtime demand components', () => {
  const dynamic: typeof import('next/dist/experimental/testing/mocking/dynamic') = require('next/dist/experimental/testing/mocking/dynamic')
  const cache: typeof import('next/dist/experimental/testing/mocking/module-cache') = require('next/dist/experimental/testing/mocking/module-cache')
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((yes, no) => {
      resolve = yes
      reject = no
    })
    return { promise, resolve, reject }
  }
  function host(
    edges: unknown = [{ owner: 4, target: 2, site: 0 }],
    ids = [1, 2, 3, 4, 5, 6],
    targets: object[] = [
      { id: 2, requests: ['./a'] },
      { id: 3, requests: ['./b'] },
    ],
    hasPendingNamespace = true
  ) {
    const evaluated: number[] = []
    const values = new Map<number, any>(
      [2, 3, 4, 5, 6].map((id) => [id, { id }])
    )
    const bodies = new Map<number, (importer: any) => any>()
    const prototype = {
      i(this: any, id: number): any {
        let record = this.c.get(id)
        if (record) return record.result ?? record.exports
        const exports = values.get(id)
        record = { id, exports }
        this.c.set(id, record)
        evaluated.push(id)
        const body = bodies.get(id)
        if (body) {
          const importer = Object.assign(Object.create(prototype), {
            m: record,
            c: this.c,
            M: this.M,
          })
          record.result = Promise.resolve().then(() => body(importer))
          record.pending = true
          record.result.then(
            () => {
              record.pending = false
            },
            () => {
              record.pending = false
            }
          )
          return record.result
        }
        return exports
      },
      A(this: any, id: number) {
        return this.r(id)((target: number) => this.i(target))
      },
      r(id: number) {
        return (load: (id: number) => unknown) =>
          Promise.resolve().then(() => load(id - 10))
      },
      E(this: any, id: number, expected: unknown) {
        const record = this.c.get(id)
        return record === expected && record.pending
          ? record.exports
          : undefined
      },
    }
    if (!hasPendingNamespace) Reflect.deleteProperty(prototype, 'E')
    const context = Object.assign(Object.create(prototype), {
      m: { id: 0 },
      c: new Map(),
      M: new Map([1, 2, 3, 4, 5, 6].map((id) => [id, () => {}])),
    })
    const cacheOwner = cache.initializeModuleCache(
      context,
      { version: 1, resettable: ids, protected: [] },
      () => {}
    )
    const before = Object.getOwnPropertyDescriptors(prototype)
    const late: Error[] = []
    let binding: ReturnType<typeof dynamic.initializeDynamicModuleMocking>
    try {
      binding = dynamic.initializeDynamicModuleMocking(
        context,
        {
          version: 1,
          owners: [1],
          targets,
          ...(edges === 'absent' ? {} : { staticDemands: edges }),
        } as any,
        {
          trackImport() {},
          onLateFailure(error) {
            late.push(error)
          },
        }
      )
    } catch (error) {
      cacheOwner.dispose()
      throw error
    }
    const importer = (id: number) => {
      let record = context.c.get(id)
      if (!record) {
        record = { id, exports: values.get(id) }
        context.c.set(id, record)
      }
      return Object.assign(Object.create(prototype), {
        m: record,
        c: context.c,
        M: context.M,
      })
    }
    return {
      context,
      prototype,
      before,
      evaluated,
      values,
      bodies,
      late,
      binding,
      cacheOwner,
      importer,
      close() {
        binding.dispose()
        cacheOwner.dispose()
      },
    }
  }
  it('keeps registration lazy, shares a dependency-started pending result and preserves exact exports descriptors', async () => {
    const h = host()
    try {
      const gate = deferred<void>()
      const started = deferred<void>()
      const value = Object.create(null, {
        token: { value: {}, enumerable: false, configurable: true },
        live: { get: () => 7, enumerable: true },
      })
      const factory = jest.fn(async () => {
        started.resolve()
        await gate.promise
        return value
      })
      dynamic.doMock('./a', factory)
      expect(h.evaluated).toEqual([])
      expect(factory).not.toHaveBeenCalled()
      const pending = h.importer(4).D(0, 2)
      await started.promise
      const independent = h.importer(1).A(12)
      gate.resolve()
      expect(await pending).toBe(value)
      expect(await independent).toBe(value)
      expect(await h.importer(4).D(0, 2)).toBe(value)
      expect(Object.getOwnPropertyDescriptors(await pending)).toEqual(
        Object.getOwnPropertyDescriptors(value)
      )
      expect(Object.getPrototypeOf(await pending)).toBeNull()
      expect(factory).toHaveBeenCalledTimes(1)
      expect(h.evaluated).toEqual([])
      cache.resetModules()
      expect(await h.importer(4).D(0, 2)).toBe(value)
      dynamic.doUnmock('./a')
      expect(await h.importer(4).D(0, 2)).toBe(h.values.get(2))
      expect(h.evaluated).toEqual([2])
    } finally {
      h.close()
    }
    expect(Object.getOwnPropertyDescriptors(h.prototype)).toEqual(h.before)
  })
  it('holds later ordinary evaluation behind the actual earlier dependency demand', async () => {
    const h = host([
      { owner: 4, target: 2, site: 0 },
      { owner: 4, target: 5, site: 1 },
    ])
    try {
      const gate = deferred<void>()
      const started = deferred<void>()
      dynamic.doMock('./a', async () => {
        started.resolve()
        await gate.promise
        return { token: 'a' }
      })
      const consumer = h.importer(4)
      const body = (async () => {
        const first = await consumer.D(0, 2)
        const second = await consumer.D(1, 5)
        return { first, second }
      })()
      await started.promise
      expect(h.evaluated).toEqual([])
      gate.resolve()
      expect(await body).toEqual({
        first: { token: 'a' },
        second: h.values.get(5),
      })
      expect(h.evaluated).toEqual([5])
    } finally {
      h.close()
    }
  })
  it('carries the actual ancestor cache record across an awaited ordinary module in a cycle', async () => {
    const h = host([
      { owner: 2, target: 5, site: 0 },
      { owner: 5, target: 3, site: 0 },
      { owner: 3, target: 2, site: 0 },
    ])
    try {
      const gate = deferred<void>()
      const reached = deferred<void>()
      let observed: unknown
      h.bodies.set(2, async (importer) => {
        await importer.D(0, 5)
        return h.values.get(2)
      })
      h.bodies.set(5, async (importer) => {
        reached.resolve()
        await gate.promise
        await importer.D(0, 3)
        return h.values.get(5)
      })
      h.bodies.set(3, async (importer) => {
        observed = await importer.D(0, 2)
        return h.values.get(3)
      })
      dynamic.doMock('./a', async (original) => {
        await original()
        return { token: 'mock-a' }
      })
      dynamic.doMock('./b', async (original) => {
        await original()
        return { token: 'mock-b' }
      })
      const pending = h.importer(1).A(12)
      await reached.promise
      expect(h.evaluated).toEqual([2, 5])
      gate.resolve()
      expect(await pending).toEqual({ token: 'mock-a' })
      expect(observed).toBe(h.values.get(2))
      expect(h.evaluated).toEqual([2, 5, 3])
    } finally {
      h.close()
    }
  })
  it('retries a failed dependency factory with fresh wrappers and its exact raw cause', async () => {
    const h = host()
    try {
      const raw = new Error('dependency body')
      const factory = jest.fn(() => {
        throw raw
      })
      dynamic.doMock('./a', factory)
      const consumer = h.importer(4)
      const first = await consumer.D(0, 2).catch((error: Error) => error)
      const second = await consumer.D(0, 2).catch((error: Error) => error)
      expect(first).toBeInstanceOf(Error)
      expect(first.message).toContain(
        '[vitest] There was an error when mocking'
      )
      expect(second).not.toBe(first)
      expect(first.cause).toBe(raw)
      expect(second.cause).toBe(raw)
      expect(factory).toHaveBeenCalledTimes(2)
      expect(h.evaluated).toEqual([])
    } finally {
      h.close()
    }
  })
  it.each(['entry', 'dependency'] as const)(
    'retries a throwing then getter through the %s public import boundary',
    async (path) => {
      const h = host()
      try {
        const raw = new Error('then getter')
        let reads = 0
        const value = { token: {} }
        let attempts = 0
        const factory = jest.fn(() =>
          ++attempts === 1
            ? Object.create(null, {
                then: {
                  get() {
                    reads++
                    throw raw
                  },
                },
              })
            : value
        )
        dynamic.doMock('./a', factory)
        const load = () =>
          path === 'entry' ? h.importer(1).A(12) : h.importer(4).D(0, 2)
        const error = await load().catch((failure: Error) => failure)
        expect(error).toBeInstanceOf(Error)
        expect(error.cause).toBe(raw)
        expect(error).not.toBe(raw)
        expect(await load()).toBe(value)
        expect(await load()).toBe(value)
        expect(reads).toBe(1)
        expect(factory).toHaveBeenCalledTimes(2)
        expect(h.evaluated).toEqual([])
      } finally {
        h.close()
      }
    }
  )
  it.each(['entry', 'dependency'] as const)(
    'preserves the then receiver and retries adoption rejection through %s',
    async (path) => {
      const h = host()
      try {
        const raw = new Error('then rejection')
        const value = { token: {} }
        const receivers: unknown[] = []
        const thenable = {
          then(
            this: unknown,
            _resolve: unknown,
            reject: (error: Error) => void
          ) {
            receivers.push(this)
            reject(raw)
          },
        }
        let attempts = 0
        const factory = jest.fn((): any =>
          ++attempts === 1 ? thenable : value
        )
        dynamic.doMock('./a', factory)
        const load = () =>
          path === 'entry' ? h.importer(1).A(12) : h.importer(4).D(0, 2)
        const error = await load().catch((failure: Error) => failure)
        expect(error.cause).toBe(raw)
        expect(receivers).toEqual([thenable])
        expect(await load()).toBe(value)
        expect(await load()).toBe(value)
        expect(factory).toHaveBeenCalledTimes(2)
        expect(h.evaluated).toEqual([])
      } finally {
        h.close()
      }
    }
  )
  it.each([{ invalid: null }, { invalid: undefined }, { invalid: [] }])(
    'clears a rejected invalid return before retrying the same registration: $invalid',
    async ({ invalid }) => {
      const h = host()
      try {
        const value = { token: {} }
        let attempts = 0
        const factory = jest.fn((): any => (++attempts === 1 ? invalid : value))
        dynamic.doMock('./a', factory)
        const error = await h
          .importer(4)
          .D(0, 2)
          .catch((failure: Error) => failure)
        expect(error.cause).toBeInstanceOf(TypeError)
        expect(error.cause.message).toContain('exports object')
        expect(await h.importer(4).D(0, 2)).toBe(value)
        expect(await h.importer(1).A(12)).toBe(value)
        expect(factory).toHaveBeenCalledTimes(2)
        expect(h.evaluated).toEqual([])
      } finally {
        h.close()
      }
    }
  )
  it('retains distinct registration objects while an older dependency factory settles', async () => {
    const h = host()
    try {
      const gate = deferred<void>()
      const started = deferred<void>()
      const old = { version: 'old' }
      const next = { version: 'next' }
      dynamic.doMock('./a', async () => {
        started.resolve()
        await gate.promise
        return old
      })
      const pending = h.importer(4).D(0, 2)
      await started.promise
      dynamic.doMock('./a', () => next)
      expect(await h.importer(1).A(12)).toBe(next)
      gate.resolve()
      expect(await pending).toBe(old)
      expect(await h.importer(4).D(0, 2)).toBe(old)
    } finally {
      h.close()
    }
  })
  it('retains a failed original dependency evaluation until actual cache reset while retrying factory wrappers', async () => {
    const h = host([{ owner: 2, target: 3, site: 0 }])
    try {
      let failing = true
      const raw = new Error('retained dependency original')
      const a = jest.fn(async (original) => ({
        dependency: (await original()).dependency,
      }))
      const value = { token: {} }
      const b = jest.fn(() => {
        if (failing) throw raw
        return value
      })
      h.bodies.set(2, async (importer) => ({
        dependency: await importer.D(0, 3),
      }))
      dynamic.doMock('./a', a)
      dynamic.doMock('./b', b)
      const first = await h
        .importer(1)
        .A(12)
        .catch((error: Error) => error)
      const second = await h
        .importer(1)
        .A(12)
        .catch((error: Error) => error)
      expect(first).not.toBe(second)
      expect(first.cause).toBe(second.cause)
      expect(first.cause.cause).toBe(raw)
      expect(a).toHaveBeenCalledTimes(2)
      expect(b).toHaveBeenCalledTimes(1)
      failing = false
      expect(await h.importer(1).A(13)).toBe(value)
      const third = await h
        .importer(1)
        .A(12)
        .catch((error: Error) => error)
      expect(third.cause).toBe(first.cause)
      cache.resetModules()
      expect((await h.importer(1).A(12)).dependency).toBe(value)
      expect(a).toHaveBeenCalledTimes(4)
      expect(b).toHaveBeenCalledTimes(2)
      expect(h.evaluated).toEqual([2, 2])
    } finally {
      h.close()
    }
  })
  it('keeps a held dependency registration and its actual pending owner result across reset', async () => {
    const h = host([{ owner: 2, target: 3, site: 0 }])
    try {
      const gate = deferred<void>()
      const started = deferred<void>()
      const value = { token: {} }
      h.bodies.set(2, async (importer) => ({
        dependency: await importer.D(0, 3),
      }))
      dynamic.doMock('./a', async (original) => ({
        dependency: (await original()).dependency,
      }))
      dynamic.doMock('./b', async () => {
        started.resolve()
        await gate.promise
        return value
      })
      const pending = h.importer(1).A(12)
      await started.promise
      const oldRecord = h.context.c.get(2)
      cache.resetModules()
      expect(h.context.c.has(2)).toBe(false)
      gate.resolve()
      const result = await pending
      expect(result.dependency).toBe(value)
      expect(await h.importer(1).A(12)).toBe(result)
      expect(h.context.c.get(2)).not.toBe(oldRecord)
      expect(h.evaluated).toEqual([2])
    } finally {
      h.close()
    }
  })
  it('continues a previously current source record after reset without admitting an unrelated stale caller', async () => {
    const h = host([
      { owner: 2, target: 3, site: 0 },
      { owner: 2, target: 5, site: 1 },
    ])
    try {
      const gate = deferred<void>()
      const started = deferred<void>()
      const value = { token: {} }
      h.bodies.set(2, async (importer) => {
        const dependency = await importer.D(0, 3)
        const ordinary = await importer.D(1, 5)
        return { dependency, ordinary }
      })
      dynamic.doMock('./a', async (original) => ({ ...(await original()) }))
      dynamic.doMock('./b', async () => {
        started.resolve()
        await gate.promise
        return value
      })
      const pending = h.importer(1).A(12)
      await started.promise
      const retained = h.context.c.get(2)
      cache.resetModules()
      const foreign = Object.assign(Object.create(h.prototype), {
        m: retained,
        c: h.context.c,
        M: h.context.M,
      })
      expect(() => foreign.D(1, 5)).toThrow(
        'actual owner and retained factories'
      )
      gate.resolve()
      const result = await pending
      expect(result.dependency).toBe(value)
      expect(result.ordinary).toBe(h.values.get(5))
      expect(h.evaluated).toEqual([2, 5])
    } finally {
      h.close()
    }
  })
  it('retains only a newly created real original owner across a wait before its first demand', async () => {
    const h = host([{ owner: 2, target: 3, site: 0 }])
    const gate = deferred<void>(),
      started = deferred<void>()
    const value = { token: {} }
    try {
      h.bodies.set(2, async (importer) => {
        started.resolve()
        await gate.promise
        return { dependency: await importer.D(0, 3) }
      })
      dynamic.doMock('./a', async (original) => ({ ...(await original()) }))
      dynamic.doMock('./b', () => value)
      const pending = h.importer(1).A(12)
      await started.promise
      const retained = h.context.c.get(2)
      cache.resetModules()
      expect(h.context.c.has(2)).toBe(false)
      const foreign = Object.assign(Object.create(h.prototype), {
        m: retained,
        c: h.context.c,
        M: h.context.M,
      })
      expect(() => foreign.D(0, 3)).toThrow(
        'actual owner and retained factories'
      )
      gate.resolve()
      expect((await pending).dependency).toBe(value)
      expect(h.evaluated).toEqual([2])
    } finally {
      gate.resolve()
      h.close()
    }
  })
  it('does not capture a preexisting unrelated owner into a real original activation', async () => {
    const h = host([{ owner: 4, target: 3, site: 0 }])
    const gate = deferred<void>(),
      started = deferred<void>()
    const unrelated = h.importer(4),
      factory = jest.fn(() => ({ token: {} }))
    try {
      h.bodies.set(2, async () => {
        started.resolve()
        await gate.promise
        return unrelated.D(0, 3)
      })
      dynamic.doMock('./a', async (original) => ({ ...(await original()) }))
      dynamic.doMock('./b', factory)
      const pending = h
        .importer(1)
        .A(12)
        .catch((error: Error) => error)
      await started.promise
      cache.resetModules()
      gate.resolve()
      expect(await pending).toMatchObject({
        cause: {
          message:
            'Runtime static demand has no actual owner and retained factories.',
        },
      })
      expect(factory).not.toHaveBeenCalled()
      expect(h.evaluated).toEqual([2])
    } finally {
      gate.resolve()
      h.close()
    }
  })
  it('uses the genuine enumerable cause descriptor while preserving the exact raw cause', async () => {
    const h = host()
    try {
      const raw = new Error('enumerable genuine cause')
      dynamic.doMock('./a', () => {
        throw raw
      })
      const error = await h
        .importer(1)
        .A(12)
        .catch((error: Error) => error)
      expect(Object.getOwnPropertyDescriptor(error, 'cause')).toEqual({
        value: raw,
        writable: true,
        enumerable: true,
        configurable: true,
      })
      expect(error.cause).toBe(raw)
    } finally {
      h.close()
    }
  })
  it('rejects foreign readsites and replaced cache records before any target evaluation', () => {
    const h = host()
    try {
      const consumer = h.importer(4)
      expect(() => h.importer(6).D(0, 2)).toThrow('compiler readsite')
      expect(() => consumer.D(1, 2)).toThrow('compiler readsite')
      expect(() => consumer.D(0, 3)).toThrow('compiler readsite')
      h.context.c.set(4, { id: 4, exports: {} })
      expect(() => consumer.D(0, 2)).toThrow(
        'actual owner and retained factories'
      )
      expect(h.evaluated).toEqual([])
    } finally {
      h.close()
    }
  })
  it('leaves the complete prototype unchanged when demands are absent', () => {
    const h = host('absent')
    try {
      expect(Object.getOwnPropertyDescriptor(h.prototype, 'D')).toBeUndefined()
    } finally {
      h.close()
    }
    expect(Object.getOwnPropertyDescriptors(h.prototype)).toEqual(h.before)
  })
  it.each([
    null,
    [],
    {},
    [{ owner: 4, target: 2 }],
    [{ owner: 4, target: 2, site: -1 }],
    [{ owner: 4, target: 2, site: 0.5 }],
    [{ owner: 4, target: 2, site: Number.MAX_SAFE_INTEGER + 1 }],
    [{ owner: 1, target: 2, site: 0 }],
    [{ owner: 4, target: 1, site: 0 }],
    [{ owner: 2, target: 2, site: 0 }],
    [{ owner: 99, target: 2, site: 0 }],
    [{ owner: 4, target: 99, site: 0 }],
    [
      { owner: 4, target: 2, site: 0 },
      { owner: 4, target: 2, site: 0 },
    ],
  ])('rejects malformed or unowned ordered demand metadata %p', (edges) => {
    expect(() => host(edges)).toThrow(
      /Invalid runtime static demand|not owned by this module cache/
    )
  })
  it('rejects a protected graph owner without evaluating any source', () => {
    expect(() => host(undefined, [1, 2, 3, 5, 6])).toThrow(
      'not owned by this module cache'
    )
  })
  it('requires the pending-native helper only for a nonempty demand graph', () => {
    expect(() => host(undefined, undefined, undefined, false)).toThrow(
      'Invalid runtime static demand graph'
    )
    const h = host('absent', undefined, undefined, false)
    try {
      expect(Object.getOwnPropertyDescriptor(h.prototype, 'D')).toBeUndefined()
    } finally {
      h.close()
    }
  })
  it('rejects native target demand metadata at the existing cache owner', () => {
    expect(() =>
      host(undefined, undefined, [
        { id: 2, requests: ['./a'], nativeOriginal: 'esm' },
      ])
    ).toThrow('Invalid runtime static demand edge identity')
  })
  it('requires both retained actual factories before demanding a target', () => {
    const h = host()
    try {
      const consumer = h.importer(4)
      h.context.M.delete(2)
      expect(() => consumer.D(0, 2)).toThrow(
        'actual owner and retained factories'
      )
      expect(h.evaluated).toEqual([])
    } finally {
      h.close()
    }
  })
  it('rejects a different module-cache context even when its maps and IDs match', () => {
    const h = host('absent')
    h.binding.dispose()
    try {
      const foreign = Object.assign(Object.create(h.prototype), h.context)
      expect(() =>
        dynamic.initializeDynamicModuleMocking(
          foreign,
          {
            version: 1,
            owners: [1],
            targets: [{ id: 2, requests: ['./a'] }],
            staticDemands: [{ owner: 4, target: 2, site: 0 }],
          },
          { trackImport() {}, onLateFailure() {} }
        )
      ).toThrow('not owned by this module cache')
      expect(Object.getOwnPropertyDescriptor(h.prototype, 'D')).toBeUndefined()
      expect(h.evaluated).toEqual([])
    } finally {
      h.cacheOwner.dispose()
    }
  })
  it('detects replacement of its demand method before restoring prototype ownership', () => {
    const h = host()
    Reflect.set(h.prototype, 'D', () => ({ foreign: true }))
    try {
      expect(() => h.binding.dispose()).toThrow(
        'Runtime static demand ownership changed before disposal'
      )
    } finally {
      h.cacheOwner.dispose()
    }
  })
  it('cancels a held dependency import as its raw ownership failure and restores D', async () => {
    const h = host()
    const gate = deferred<void>()
    const started = deferred<void>()
    dynamic.doMock('./a', async () => {
      started.resolve()
      await gate.promise
      return { token: 'late' }
    })
    const pending = h.importer(4).D(0, 2)
    const observed = pending.catch((error: Error) => error)
    await started.promise
    expect(() => h.binding.dispose()).toThrow('cancelled during file cleanup')
    const failure = await observed
    expect(failure.message).toContain('cancelled during file cleanup')
    expect(failure.cause).toBeUndefined()
    expect(Object.getOwnPropertyDescriptors(h.prototype)).toEqual(h.before)
    gate.resolve()
    await Promise.resolve()
    await Promise.resolve()
    h.cacheOwner.dispose()
  })
  it('cancels an actual D waiter on an A-started factory without borrowing a fresh owner', async () => {
    const h = host()
    const started = deferred<void>()
    const gate = deferred<void>()
    const reported = deferred<void>()
    const push = h.late.push.bind(h.late)
    h.late.push = (...errors) => {
      const size = push(...errors)
      reported.resolve()
      return size
    }
    dynamic.doMock('./a', async () => {
      started.resolve()
      await gate.promise
      return { token: 'stale' }
    })
    const entry = h
      .importer(1)
      .A(12)
      .catch((error: Error) => error)
    await started.promise
    const dependency = h
      .importer(4)
      .D(0, 2)
      .catch((error: Error) => error)
    expect(() => h.binding.dispose()).toThrow('cancelled during file cleanup')
    for (const error of await Promise.all([entry, dependency])) {
      expect(error.message).toContain('cancelled during file cleanup')
      expect(error.cause).toBeUndefined()
    }
    h.cacheOwner.dispose()
    const fresh = host()
    try {
      const factory = jest.fn(() => ({ token: 'fresh' }))
      dynamic.doMock('./a', factory)
      const first = await fresh.importer(4).D(0, 2)
      gate.resolve()
      await reported.promise
      expect(await fresh.importer(1).A(12)).toBe(first)
      expect(first.token).toBe('fresh')
      expect(factory).toHaveBeenCalledTimes(1)
      expect(h.late).toHaveLength(1)
      expect(fresh.late).toEqual([])
      expect(fresh.evaluated).toEqual([])
    } finally {
      fresh.close()
    }
  })
})

describe('native pending namespace primitive with actual async runtime state', () => {
  function runtime() {
    const fs = require('node:fs')
    const path = require('node:path')
    const vm = require('node:vm')
    const ts = require('typescript')
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime/async-module.ts'
      ),
      'utf8'
    )
    const prototype: any = {}
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        contextPrototype: prototype,
        Promise,
        createPromise() {
          let resolve!: (value?: unknown) => void
          let reject!: (error: unknown) => void
          const promise = new Promise((yes, no) => {
            resolve = yes
            reject = no
          })
          return { promise, resolve, reject }
        },
      }
    )
    return prototype
  }
  it('retains actual original Promise metadata so an unregistered dependency cycle finishes', async () => {
    const dynamic = require('next/dist/experimental/testing/mocking/dynamic')
    const cache = require('next/dist/experimental/testing/mocking/module-cache')
    const prototype = runtime()
    const records = new Map<number, any>([[1, { id: 1, exports: {} }]])
    const factories = new Map([1, 2, 3].map((id) => [id, () => {}]))
    const context = Object.assign(Object.create(prototype), {
      m: records.get(1),
      c: records,
      M: factories,
    })
    const completed: number[] = []
    const reads: Array<{
      same: boolean
      symbols: symbol[]
      originalSymbols: symbol[]
    }> = []
    prototype.i = function (this: any, id: number) {
      if (records.has(id)) return records.get(id).exports
      const record: any = { id, exports: { id } }
      records.set(id, record)
      const self = Object.assign(Object.create(prototype), {
        m: record,
        c: records,
        M: factories,
      })
      prototype.a.call(
        self,
        async (handle: any, result: any) => {
          try {
            const peer = id === 2 ? 3 : 2
            const value = self.D(0, peer)
            const original = records.get(peer).exports
            reads.push({
              same: value === original,
              symbols: Object.getOwnPropertySymbols(value),
              originalSymbols: Object.getOwnPropertySymbols(original),
            })
            const dependencies = handle([value])
            if (dependencies.then) (await dependencies)()
            completed.push(id)
            result()
          } catch (error) {
            result(error)
          }
        },
        true
      )
      return record.exports
    }
    prototype.r = (id: number) => (load: (target: number) => unknown) =>
      Promise.resolve().then(() => load(id - 10))
    prototype.A = function (this: any, id: number) {
      return this.r(id)(this.i.bind(this))
    }
    const owner = cache.initializeModuleCache(
      context,
      { version: 1, resettable: [2, 3], protected: [1] },
      () => {}
    )
    const tracked = jest.fn()
    const late = jest.fn()
    const binding = dynamic.initializeDynamicModuleMocking(
      context,
      {
        version: 1,
        owners: [1],
        targets: [
          { id: 2, requests: ['./a'] },
          { id: 3, requests: ['./b'] },
        ],
        staticDemands: [
          { owner: 2, target: 3, site: 0 },
          { owner: 3, target: 2, site: 0 },
        ],
      },
      { trackImport: tracked, onLateFailure: late }
    )
    try {
      expect(await prototype.i.call(context, 2)).toEqual({ id: 2 })
      expect(completed).toEqual([3, 2])
      expect(reads).toHaveLength(2)
      expect(reads.every((read) => read.same)).toBe(true)
      for (const read of reads) {
        expect(read.symbols).toEqual(read.originalSymbols)
        expect(read.symbols.map(String)).toEqual(
          expect.arrayContaining([
            'Symbol(turbopack async module id)',
            'Symbol(turbopack async settled)',
            'Symbol(turbopack exports)',
            'Symbol(turbopack queues)',
          ])
        )
      }
      expect(tracked).not.toHaveBeenCalled()
      expect(late).not.toHaveBeenCalled()
    } finally {
      binding.dispose()
      owner.dispose()
    }
  })
  it('reads the exact pending namespace only for the same actual cache record and never instantiates a missing module', async () => {
    const prototype = runtime()
    const value = Object.create(null, {
      token: { enumerable: true, get: () => 7 },
    })
    const module = { id: 2, exports: value }
    const context = { m: { id: 1 }, c: new Map([[2, module]]) }
    let settle!: (error?: unknown) => void
    prototype.a.call(
      { m: module },
      (_handle: unknown, result: typeof settle) => {
        settle = result
      },
      true
    )
    expect(prototype.E.call(context, 2, module)).toBe(value)
    expect(
      prototype.E.call(context, 2, { id: 2, exports: value })
    ).toBeUndefined()
    expect(prototype.E.call(context, 99, module)).toBeUndefined()
    context.c.delete(2)
    expect(prototype.E.call(context, 2, module)).toBeUndefined()
    context.c.set(2, { id: 2, exports: value })
    expect(prototype.E.call(context, 2, module)).toBeUndefined()
    context.c.set(2, module)
    module.id = 3
    expect(prototype.E.call(context, 2, module)).toBeUndefined()
    module.id = 2
    expect(prototype.E.call(context, 2, module)).toBe(value)
    settle()
    expect(await module.exports).toBe(value)
    expect(prototype.E.call(context, 2, module)).toBeUndefined()
    expect(context.c.size).toBe(1)
  })
  it('refuses settled rejected and ordinary module records while preserving the real rejection', async () => {
    const prototype = runtime()
    const module = { id: 'pending', exports: { token: {} } }
    const context = {
      c: new Map<string, { id: string; exports: unknown }>([
        ['pending', module],
        ['ordinary', { id: 'ordinary', exports: {} }],
      ]),
    }
    let settle!: (error?: unknown) => void
    prototype.a.call(
      { m: module },
      (_handle: unknown, result: typeof settle) => {
        settle = result
      },
      true
    )
    const cause = new Error('actual async evaluation')
    const rejected = Promise.resolve(module.exports).catch((error) => error)
    settle(cause)
    expect(await rejected).toBe(cause)
    expect(prototype.E.call(context, 'pending', module)).toBeUndefined()
    expect(
      prototype.E.call(context, 'ordinary', context.c.get('ordinary'))
    ).toBeUndefined()
  })
})
