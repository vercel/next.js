import { loadManifest } from './load-manifest.external'
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
