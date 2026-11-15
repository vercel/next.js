import { evalManifest, loadManifest } from './load-manifest.external'
import { readFileSync } from 'fs'

jest.mock('fs')

describe('loadManifest', () => {
  const cache = new Map<string, unknown>()

  afterEach(() => {
    jest.resetAllMocks()
    cache.clear()
  })

  it('should load the manifest from the file system when not cached', () => {
    const mockManifest = { key: 'value' }
    ;(readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest))

    let result = loadManifest('path/to/manifest', false)
    expect(result).toEqual(mockManifest)
    expect(readFileSync).toHaveBeenCalledTimes(1)
    expect(readFileSync).toHaveBeenCalledWith('path/to/manifest', 'utf8')
    expect(cache.has('path/to/manifest')).toBe(false)

    result = loadManifest('path/to/manifest', false)
    expect(result).toEqual(mockManifest)
    expect(readFileSync).toHaveBeenCalledTimes(2)
    expect(readFileSync).toHaveBeenCalledWith('path/to/manifest', 'utf8')
    expect(cache.has('path/to/manifest')).toBe(false)
  })

  it('should return the cached manifest when available', () => {
    const mockManifest = { key: 'value' }
    cache.set('path/to/manifest', mockManifest)

    let result = loadManifest('path/to/manifest', true, cache)
    expect(result).toBe(mockManifest)
    expect(readFileSync).not.toHaveBeenCalled()

    result = loadManifest('path/to/manifest', true, cache)
    expect(result).toBe(mockManifest)
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('should cache the manifest when not already cached', () => {
    const mockManifest = { key: 'value' }
    ;(readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest))

    const result = loadManifest('path/to/manifest', true, cache)

    expect(result).toEqual(mockManifest)
    expect(cache.get('path/to/manifest')).toEqual(mockManifest)
    expect(readFileSync).toHaveBeenCalledWith('path/to/manifest', 'utf8')
  })

  it('should throw an error when the manifest file cannot be read', () => {
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File not found')
    })

    expect(() => loadManifest('path/to/manifest', false)).toThrow(
      'File not found'
    )
  })

  it('should freeze the manifest when caching', () => {
    const mockManifest = { key: 'value', nested: { key: 'value' } }
    ;(readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest))

    const result = loadManifest(
      'path/to/manifest',
      true,
      cache
    ) as typeof mockManifest
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.nested)).toBe(true)

    const result2 = loadManifest('path/to/manifest', true, cache)
    expect(Object.isFrozen(result2)).toBe(true)

    expect(result).toBe(result2)
  })
})

describe('evalManifest', () => {
  const files: Record<string, string> = {}

  beforeEach(() => {
    ;(readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`)
      return files[path]
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    for (const key of Object.keys(files)) delete files[key]
  })

  // Shape of the manifests Turbopack writes (an IIFE with local helpers).
  const turbopackManifest = (page: string, id: number) =>
    `(() => {\n` +
    `const s = ["static/chunks/a.js"];\n` +
    `const e = (id, chunks, async = false) => ({ id, name: "*", chunks, async });\n` +
    `(globalThis.__RSC_MANIFEST ??= {})[${JSON.stringify(page)}] = {"clientModules":{"m":e(${id},s)}};\n` +
    `})();\n`

  // Shape of the manifests webpack writes.
  const webpackManifest = (page: string) =>
    `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});` +
    `globalThis.__RSC_MANIFEST[${JSON.stringify(page)}]=` +
    `{"deploymentId":process.env.NEXT_DEPLOYMENT_ID}`

  it('evaluates turbopack and webpack manifests without leaking between files', () => {
    files.a = turbopackManifest('/a/page', 1)
    files.b = turbopackManifest('/b/page', 2)
    files.c = webpackManifest('/c/page')
    const cache = new Map<string, unknown>()

    const a: any = evalManifest('a', true, cache)
    const b: any = evalManifest('b', true, cache)
    const c: any = evalManifest('c', true, cache)

    expect(Object.keys(a.__RSC_MANIFEST)).toEqual(['/a/page'])
    expect(Object.keys(b.__RSC_MANIFEST)).toEqual(['/b/page'])
    expect(Object.keys(c.__RSC_MANIFEST)).toEqual(['/c/page'])
    expect(a.__RSC_MANIFEST['/a/page'].clientModules.m).toEqual({
      id: 1,
      name: '*',
      chunks: ['static/chunks/a.js'],
      async: false,
    })
    expect(b.__RSC_MANIFEST['/b/page'].clientModules.m.id).toBe(2)
    expect((globalThis as any).__RSC_MANIFEST).toBeUndefined()
  })

  it('exposes NEXT_DEPLOYMENT_ID to the manifest', () => {
    const previous = process.env.NEXT_DEPLOYMENT_ID
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_test'
    try {
      files.c = webpackManifest('/c/page')
      const c: any = evalManifest('c', false)
      expect(c.__RSC_MANIFEST['/c/page'].deploymentId).toBe('dpl_test')
      expect(c.process.env.NEXT_DEPLOYMENT_ID).toBe('dpl_test')
    } finally {
      if (previous === undefined) delete process.env.NEXT_DEPLOYMENT_ID
      else process.env.NEXT_DEPLOYMENT_ID = previous
    }
  })

  it('freezes and caches the result', () => {
    files.a = turbopackManifest('/a/page', 1)
    const cache = new Map<string, unknown>()

    const a: any = evalManifest('a', true, cache)

    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.__RSC_MANIFEST['/a/page'].clientModules.m)).toBe(
      true
    )
    expect(evalManifest('a', true, cache)).toBe(a)
    expect(readFileSync).toHaveBeenCalledTimes(1)
  })

  it('propagates errors and does not leak state from a manifest that throws', () => {
    // The sentinel is non-enumerable, so only a fresh context hides it.
    files.bad =
      'globalThis.__RSC_MANIFEST = { "/bad": {} };' +
      'Object.defineProperty(globalThis, "__sentinel", { value: 1, configurable: true });' +
      'throw new Error("boom")'
    files.ok =
      'globalThis.__RSC_MANIFEST = { "/ok": { sentinel: typeof globalThis.__sentinel } }'

    expect(() => evalManifest('bad', false)).toThrow('boom')
    const ok: any = evalManifest('ok', false)

    expect(Object.keys(ok.__RSC_MANIFEST)).toEqual(['/ok'])
    expect(ok.__RSC_MANIFEST['/ok'].sentinel).toBe('undefined')
  })

  it('throws instead of returning a result when a global cannot be removed', () => {
    files.sticky =
      'Object.defineProperty(globalThis, "sticky", { value: 1, enumerable: true, configurable: false });' +
      'globalThis.__RSC_MANIFEST = { "/sticky": {} }'
    files.ok =
      'globalThis.__RSC_MANIFEST = { "/ok": { sticky: typeof globalThis.sticky } }'

    expect(() => evalManifest('sticky', false)).toThrow()
    const ok: any = evalManifest('ok', false)

    expect(ok.__RSC_MANIFEST['/ok'].sticky).toBe('undefined')
  })

  it('ignores globals that exist on a fresh context (e.g. `gc` with --expose-gc)', () => {
    // Node flags such as --expose-gc install a non-deletable, enumerable global
    // on every new vm context. Simulate that with a fresh module instance.
    jest.isolateModules(() => {
      const vm = require('vm') as typeof import('vm')
      const createContext = vm.createContext
      const spy = jest
        .spyOn(vm, 'createContext')
        .mockImplementation((...args: Parameters<typeof createContext>) => {
          const context = createContext(...args)
          vm.runInContext(
            'Object.defineProperty(globalThis, "gc", { value: () => {}, enumerable: true, configurable: false })',
            context
          )
          return context
        })
      try {
        // The isolated module registry has its own `fs` mock instance.
        ;(
          (require('fs') as typeof import('fs')).readFileSync as jest.Mock
        ).mockImplementation((path: string) => files[path])
        const { evalManifest: isolatedEvalManifest } =
          require('./load-manifest.external') as typeof import('./load-manifest.external')
        files.a = turbopackManifest('/a/page', 1)
        files.b = turbopackManifest('/b/page', 2)

        const a: any = isolatedEvalManifest('a', false)
        const b: any = isolatedEvalManifest('b', false)

        expect(spy).toHaveBeenCalledTimes(1)
        expect(Object.keys(a)).toEqual(['__RSC_MANIFEST', 'process'])
        expect(Object.keys(b.__RSC_MANIFEST)).toEqual(['/b/page'])
      } finally {
        spy.mockRestore()
      }
    })
  })
})
