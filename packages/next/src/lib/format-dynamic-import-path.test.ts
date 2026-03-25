import { formatDynamicImportPath } from './format-dynamic-import-path'

describe('formatDynamicImportPath', () => {
  it('should format relative paths correctly', () => {
    const result = formatDynamicImportPath('/app/.next', './cache-handler.js')
    expect(result).toBe('file:///app/.next/cache-handler.js')
  })

  it('should format absolute paths correctly', () => {
    const result = formatDynamicImportPath(
      '/app/.next',
      '/app/cache-handler.js'
    )
    expect(result).toBe('file:///app/cache-handler.js')
  })

  it('should return file:// URLs as-is', () => {
    const fileUrl = 'file:///app/cache-handler.js'
    const result = formatDynamicImportPath('/app/.next', fileUrl)
    expect(result).toBe(fileUrl)
  })

  it('should handle file:// URLs with different paths', () => {
    const fileUrl = 'file:///Users/test/project/cache-handler.cjs'
    const result = formatDynamicImportPath('/any/dir', fileUrl)
    expect(result).toBe(fileUrl)
  })

  it('should handle Windows-style absolute paths', () => {
    const result = formatDynamicImportPath(
      'C:\\app\\.next',
      'C:\\app\\cache-handler.js'
    )
    expect(result).toBe('file:///C:/app/cache-handler.js')
  })

  it('should handle uppercase FILE:// URLs case-insensitively', () => {
    const fileUrl = 'FILE:///app/cache-handler.js'
    const result = formatDynamicImportPath('/any/dir', fileUrl)
    expect(result).toBe(fileUrl)
  })

  it('should handle Windows-style file:///C:/ paths passed directly', () => {
    const fileUrl = 'file:///C:/app/cache-handler.js'
    const result = formatDynamicImportPath('C:\\app\\.next', fileUrl)
    expect(result).toBe(fileUrl)
  })
})
