/* eslint-env jest */
import { formatDynamicImportPath } from 'next/dist/lib/format-dynamic-import-path'
import path from 'path'
import { pathToFileURL } from 'url'

describe('formatDynamicImportPath', () => {
  it('should handle relative paths', () => {
    const result = formatDynamicImportPath(
      '/project/.next',
      './cache-handler.js'
    )
    expect(result).toBe(
      pathToFileURL(
        path.join('/project/.next', './cache-handler.js')
      ).toString()
    )
  })

  it('should handle absolute paths', () => {
    const result = formatDynamicImportPath(
      '/project/.next',
      '/absolute/path/cache-handler.js'
    )
    expect(result).toBe(
      pathToFileURL('/absolute/path/cache-handler.js').toString()
    )
  })

  it('should pass through file:// URLs unchanged', () => {
    const fileUrl = 'file:///absolute/path/cache-handler.js'
    const result = formatDynamicImportPath('/project/.next', fileUrl)
    expect(result).toBe(fileUrl)
  })

  it('should pass through file:// URLs from import.meta.resolve()', () => {
    const fileUrl = pathToFileURL('/project/cache-handler.mjs').toString()
    const result = formatDynamicImportPath('/project/.next', fileUrl)
    expect(result).toBe(fileUrl)
  })
})
