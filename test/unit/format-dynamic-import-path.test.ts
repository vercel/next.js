/* eslint-env jest */
import { formatDynamicImportPath } from 'next/dist/lib/format-dynamic-import-path'

describe('lib/format-dynamic-import-path in Windows', () => {
  it('should return correct path for absolute paths', async () => {
    const path = formatDynamicImportPath(
      'C:/path/to/app',
      'C:/path/to/cache-handler.js'
    )
    expect(path).toBe('file:///C:/path/to/cache-handler.js')
  })

  it('should return correct path for absolute paths with "/" in the start', async () => {
    const path = formatDynamicImportPath(
      'C:/path/to/app',
      '/C:/path/to/cache-handler.js'
    )
    expect(path).toBe('file:///C:/path/to/cache-handler.js')
  })

  it('should return correct path for relative path', async () => {
    const path = formatDynamicImportPath('C:/path/to/app', './cache-handler.js')
    expect(path).toBe('file:///C:/path/to/app/cache-handler.js')
  })

  it('should return correct path for file url absolute path', async () => {
    const path = formatDynamicImportPath(
      'C:/path/to/app',
      'file:///C:/path/to/cache-handler.js'
    )
    expect(path).toBe('file:///C:/path/to/cache-handler.js')
  })
})

describe('lib/format-dynamic-import-path in unix', () => {
  it('should return correct path for absolute paths', async () => {
    const path = formatDynamicImportPath(
      '/path/to/app',
      '/path/to/cache-handler.js'
    )
    expect(path).toBe('file:///path/to/cache-handler.js')
  })

  it('should return correct path for relative path', async () => {
    const path = formatDynamicImportPath('/path/to/app', './cache-handler.js')
    expect(path).toBe('file:///path/to/app/cache-handler.js')
  })

  it('should return correct path for file url absolute path', async () => {
    const path = formatDynamicImportPath(
      '/path/to/app',
      'file:///path/to/cache-handler.js'
    )
    expect(path).toBe('file:///path/to/cache-handler.js')
  })
})
