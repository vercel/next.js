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
