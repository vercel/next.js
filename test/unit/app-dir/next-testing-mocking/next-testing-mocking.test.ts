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
      process.on('unhandledRejection', error => errors.push(String(error)))
      const prototype = {
        i() { throw new Error('actual target evaluated') },
        r() { return load => Promise.resolve().then(() => load(2)) },
        A(id) { return this.r(id)(this.i.bind(this)) },
      }
      const context = Object.assign(Object.create(prototype), {m:{id:1}, c:new Map(), M:new Map([[2,()=>{}]])})
      const tracker = createModuleImportTracker(context)
      const binding = dynamic.initializeDynamicModuleMocking(context,{version:1,owners:[1],targets:[{id:2,requests:['./subject']}]},{trackImport:tracker.trackImport,onLateFailure:error=>errors.push('late:'+String(error))})
      dynamic.doMock('./subject',()=>{throw new Error('owned factory rejection')})
      if(process.argv[2] === 'caught') context.A(3).catch(()=>{})
      else void context.A(3)
      ;(async()=>{
        await tracker.waitForImports()
        await new Promise(setImmediate)
        binding.dispose();tracker.dispose()
        process.stdout.write(JSON.stringify(errors))
      })().catch(error=>{console.error(error);process.exitCode=1})
    `
      const errors = JSON.parse(
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
