import { loadManifest, evalManifest } from './load-manifest.external'
import { readFileSync } from 'fs'

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}))

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

  it('should return undefined and cache undefined when handleMissing is true and file is not found (ENOENT)', () => {
    const enoentError = Object.assign(new Error('ENOENT: no such file'), {
      code: 'ENOENT',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw enoentError
    })

    const result = loadManifest('path/to/missing', true, cache, false, true)
    expect(result).toBeUndefined()
    expect(cache.get('path/to/missing')).toBeUndefined()
    expect(cache.has('path/to/missing')).toBe(true)
  })

  it('should return undefined and cache undefined when handleMissing is true and module is not found (MODULE_NOT_FOUND)', () => {
    const notFoundError = Object.assign(new Error('Cannot find module'), {
      code: 'MODULE_NOT_FOUND',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw notFoundError
    })

    const result = loadManifest('path/to/missing', true, cache, false, true)
    expect(result).toBeUndefined()
    expect(cache.get('path/to/missing')).toBeUndefined()
  })

  it('should re-throw ERR_STRING_TOO_LONG when handleMissing is true', () => {
    const stringTooLongError = Object.assign(
      new Error('Cannot create a string longer than 0x1fffffe8 characters'),
      { code: 'ERR_STRING_TOO_LONG' }
    )
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw stringTooLongError
    })

    expect(() =>
      loadManifest('path/to/huge', true, cache, false, true)
    ).toThrow('Cannot create a string longer than 0x1fffffe8 characters')
    expect(cache.has('path/to/huge')).toBe(false)
  })

  it('should re-throw permission errors (EACCES) when handleMissing is true', () => {
    const eaccesError = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw eaccesError
    })

    expect(() =>
      loadManifest('path/to/protected', true, cache, false, true)
    ).toThrow('EACCES: permission denied')
    expect(cache.has('path/to/protected')).toBe(false)
  })
})

describe('evalManifest', () => {
  const cache = new Map<string, unknown>()

  afterEach(() => {
    jest.resetAllMocks()
    cache.clear()
  })

  it('should evaluate the manifest in a new context', () => {
    ;(readFileSync as jest.Mock).mockReturnValue('this.__test = { foo: "bar" }')

    const result = evalManifest<any>('path/to/manifest.js', true, cache)
    expect(result.__test).toEqual({ foo: 'bar' })
    expect(cache.has('path/to/manifest.js')).toBe(true)
  })

  it('should return undefined and cache undefined when handleMissing is true and file is not found (ENOENT)', () => {
    const enoentError = Object.assign(new Error('ENOENT: no such file'), {
      code: 'ENOENT',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw enoentError
    })

    const result = evalManifest('path/to/missing.js', true, cache, true)
    expect(result).toBeUndefined()
    expect(cache.get('path/to/missing.js')).toBeUndefined()
    expect(cache.has('path/to/missing.js')).toBe(true)
  })

  it('should return undefined and cache undefined when handleMissing is true and module is not found (MODULE_NOT_FOUND)', () => {
    const notFoundError = Object.assign(new Error('Cannot find module'), {
      code: 'MODULE_NOT_FOUND',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw notFoundError
    })

    const result = evalManifest('path/to/missing.js', true, cache, true)
    expect(result).toBeUndefined()
    expect(cache.get('path/to/missing.js')).toBeUndefined()
  })

  it('should re-throw ERR_STRING_TOO_LONG when handleMissing is true in evalManifest', () => {
    const stringTooLongError = Object.assign(
      new Error('Cannot create a string longer than 0x1fffffe8 characters'),
      { code: 'ERR_STRING_TOO_LONG' }
    )
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw stringTooLongError
    })

    expect(() => evalManifest('path/to/huge.js', true, cache, true)).toThrow(
      'Cannot create a string longer than 0x1fffffe8 characters'
    )
    expect(cache.has('path/to/huge.js')).toBe(false)
  })

  it('should re-throw permission errors (EACCES) when handleMissing is true in evalManifest', () => {
    const eaccesError = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    })
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw eaccesError
    })

    expect(() =>
      evalManifest('path/to/protected.js', true, cache, true)
    ).toThrow('EACCES: permission denied')
    expect(cache.has('path/to/protected.js')).toBe(false)
  })
})
