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
  const manifest =
    'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});' +
    'globalThis.__RSC_MANIFEST["/page"]={"ssrModuleMapping":{}};'

  afterEach(() => {
    jest.resetAllMocks()
    cache.clear()
  })

  it('should evaluate the manifest from the file system', () => {
    ;(readFileSync as jest.Mock).mockReturnValue(manifest)

    const result = evalManifest('path/to/manifest', false) as any

    expect(result.__RSC_MANIFEST['/page']).toEqual({ ssrModuleMapping: {} })
  })

  // A zero-length manifest is not a manifest that says nothing, it is a file
  // whose contents have not landed yet: webpack's `emitAsset` truncates and
  // rewrites these on every dev rebuild, and a reader can observe the window in
  // between. That is the same transient state `handleMissing` already tolerates
  // for a file that is absent altogether, so it gets the same answer instead of
  // taking the request down with it.
  it('should treat an empty manifest as missing when handling a missing manifest', () => {
    ;(readFileSync as jest.Mock).mockReturnValue('')

    expect(evalManifest('path/to/manifest', false, cache, true)).toBeUndefined()
  })

  // The tolerance is opt-in. A caller that did not ask for a missing manifest to
  // be handled still requires the manifest, and still hears about it.
  it('should throw for an empty manifest when not handling a missing manifest', () => {
    ;(readFileSync as jest.Mock).mockReturnValue('')

    expect(() => evalManifest('path/to/manifest', false, cache)).toThrow(
      'Manifest file is empty'
    )
  })

  // The empty read must not be remembered, or one unlucky read during a rebuild
  // would serve an empty manifest for the life of the process.
  it('should not cache an empty manifest, so a later read picks up the contents', () => {
    ;(readFileSync as jest.Mock).mockReturnValue('')

    expect(evalManifest('path/to/manifest', true, cache, true)).toBeUndefined()
    expect(cache.has('path/to/manifest')).toBe(false)
    ;(readFileSync as jest.Mock).mockReturnValue(manifest)

    const result = evalManifest('path/to/manifest', true, cache, true) as any
    expect(result.__RSC_MANIFEST['/page']).toEqual({ ssrModuleMapping: {} })
  })
})
