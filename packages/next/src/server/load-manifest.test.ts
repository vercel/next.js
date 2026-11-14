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
  const cache = new Map<string, unknown>()

  afterEach(() => {
    jest.resetAllMocks()
    cache.clear()
    delete (globalThis as any).__RSC_MANIFEST
  })

  it('collects what the manifest registers on globalThis without touching the real global', () => {
    ;(readFileSync as jest.Mock).mockReturnValue(
      '(globalThis.__RSC_MANIFEST ??= {})["/page"] = { chunks: ["a.js"] };'
    )

    const result = evalManifest<{ __RSC_MANIFEST: Record<string, unknown> }>(
      'path/to/manifest.js',
      false
    )

    expect(result.__RSC_MANIFEST['/page']).toEqual({ chunks: ['a.js'] })
    expect(Array.isArray((result.__RSC_MANIFEST['/page'] as any).chunks)).toBe(
      true
    )
    expect((globalThis as any).__RSC_MANIFEST).toBeUndefined()
  })

  it('exposes only the deployment id from process.env', () => {
    const prev = process.env.NEXT_DEPLOYMENT_ID
    process.env.NEXT_DEPLOYMENT_ID = 'dpl_123'
    try {
      ;(readFileSync as jest.Mock).mockReturnValue(
        'globalThis.env = Object.keys(process.env); globalThis.id = process.env.NEXT_DEPLOYMENT_ID;'
      )
      expect(evalManifest('path/to/manifest.js', false)).toEqual({
        env: ['NEXT_DEPLOYMENT_ID'],
        id: 'dpl_123',
      })
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_DEPLOYMENT_ID
      } else {
        process.env.NEXT_DEPLOYMENT_ID = prev
      }
    }
  })

  it('freezes and caches the result when caching', () => {
    ;(readFileSync as jest.Mock).mockReturnValue(
      'globalThis.__RSC_MANIFEST = { "/page": { chunks: ["a.js"] } };'
    )

    const result = evalManifest<any>('path/to/manifest.js', true, cache)
    expect(Object.isFrozen(result.__RSC_MANIFEST['/page'].chunks)).toBe(true)
    expect(evalManifest('path/to/manifest.js', true, cache)).toBe(result)
    expect(readFileSync).toHaveBeenCalledTimes(1)
  })

  it('throws on an empty file', () => {
    ;(readFileSync as jest.Mock).mockReturnValue('')
    expect(() => evalManifest('path/to/manifest.js', false)).toThrow(
      'Manifest file is empty'
    )
  })
})
