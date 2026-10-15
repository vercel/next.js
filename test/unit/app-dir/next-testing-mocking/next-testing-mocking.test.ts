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
