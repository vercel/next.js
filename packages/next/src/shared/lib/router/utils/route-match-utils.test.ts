import { safeCompile } from './route-match-utils'
import {
  PARAM_SEPARATOR,
  stripNormalizedSeparators,
} from '../../../../lib/route-pattern-normalizer'

describe('safeCompile', () => {
  describe('interception route patterns', () => {
    it('should strip _NEXTSEP_ from compiled output for (.) interception marker', () => {
      // Pattern with interception marker followed by parameter
      const pattern = '/photos/(.):author/:id'
      const compile = safeCompile(pattern, { validate: false })

      // The interception marker (.) is treated as an unnamed parameter (index 0)
      const result = compile({ '0': '(.)', author: 'next', id: '123' })

      // Should NOT contain the internal separator
      expect(result).toBe('/photos/(.)next/123')
    })

    it('should strip _NEXTSEP_ from compiled output for (..) interception marker', () => {
      const pattern = '/photos/(..):category/:id'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ '0': '(..)', category: 'blog', id: '456' })

      expect(result).toBe('/photos/(..)blog/456')
    })

    it('should strip _NEXTSEP_ from compiled output for (...) interception marker', () => {
      const pattern = '/photos/(...):path'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ '0': '(...)', path: 'deep/nested/route' })

      expect(result).toBe('/photos/(...)deep/nested/route')
    })

    it('should strip _NEXTSEP_ from compiled output for (..)(..) interception marker', () => {
      const pattern = '/photos/(.)(..)/:id'
      const compile = safeCompile(pattern, { validate: false })

      // (..)(..) is treated as two unnamed parameters
      const result = compile({ '0': '(..)', '1': '(..)', id: '789' })

      expect(result).toBe('/photos/(..)(..)/789')
    })

    it('should handle multiple interception markers in one pattern', () => {
      const pattern = '/(.):author/photos/(.):id'
      const compile = safeCompile(pattern, { validate: false })

      // Multiple markers are numbered sequentially
      const result = compile({
        '0': '(.)',
        author: 'john',
        '1': '(.)',
        id: '999',
      })

      expect(result).toBe('/(.)john/photos/(.)999')
    })

    it('should work with the actual failing case from interception routes', () => {
      // This is the exact pattern that was failing
      const pattern =
        '/intercepting-routes-dynamic/photos/(.):nxtPauthor/:nxtPid'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({
        '0': '(.)',
        nxtPauthor: 'next',
        nxtPid: '123',
      })

      expect(result).toBe('/intercepting-routes-dynamic/photos/(.)next/123')
    })
  })

  describe('patterns without normalization needs', () => {
    it('should work normally for patterns without adjacent parameters', () => {
      const pattern = '/photos/:author/:id'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ author: 'jane', id: '456' })

      expect(result).toBe('/photos/jane/456')
    })

    it('should work with optional parameters', () => {
      const pattern = '/photos/:author?/:id'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ id: '789' })

      expect(result).toBe('/photos/789')
    })

    it('should work with catchall parameters', () => {
      const pattern = '/files/:path*'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ path: ['folder', 'subfolder', 'file.txt'] })

      expect(result).toBe('/files/folder/subfolder/file.txt')
    })
  })

  describe('edge cases', () => {
    it('should handle patterns with path separators between parameters', () => {
      // Normal case - parameters separated by path segments
      const pattern = '/:param1/separator/:param2'
      const compile = safeCompile(pattern, { validate: false })

      const result = compile({ param1: 'value1', param2: 'value2' })

      expect(result).toBe('/value1/separator/value2')
    })

    it('should not strip _NEXTSEP_ from user content outside interception markers', () => {
      // If user content happens to contain _NEXTSEP_, it should be preserved
      // Only separators after interception markers should be stripped
      const pattern = '/:folder/:file'
      const compile = safeCompile(pattern, { validate: false })

      // User has a file or folder named something_NEXTSEP_something
      const result = compile({
        folder: 'my_NEXTSEP_folder',
        file: 'my_NEXTSEP_file.txt',
      })

      // The _NEXTSEP_ in user content should be preserved
      expect(result).toBe('/my_NEXTSEP_folder/my_NEXTSEP_file.txt')
    })
  })
})

describe('stripNormalizedSeparators', () => {
  it('should strip _NEXTSEP_ after single dot interception marker', () => {
    const input = `/photos/(.)${PARAM_SEPARATOR}next/123`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe('/photos/(.)next/123')
  })

  it('should strip _NEXTSEP_ after double dot interception marker', () => {
    const input = `/photos/(..)${PARAM_SEPARATOR}blog/456`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe('/photos/(..)blog/456')
  })

  it('should strip _NEXTSEP_ after triple dot interception marker', () => {
    const input = `/photos/(...)${PARAM_SEPARATOR}deep/nested/route`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe('/photos/(...)deep/nested/route')
  })

  it('should strip _NEXTSEP_ for adjacent interception markers with parameters', () => {
    // When there are two separate interception paths, each with parameters
    // Pattern: /(.)_NEXTSEP_:param1/(..)_NEXTSEP_:param2
    // After compilation: /(.)_NEXTSEP_value1/(..)_NEXTSEP_value2
    const input = `/(.)${PARAM_SEPARATOR}first/(..)${PARAM_SEPARATOR}second`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe('/(.)first/(..)second')
  })

  it('should handle multiple interception markers in one path', () => {
    const input = `/(.)${PARAM_SEPARATOR}john/photos/(.)${PARAM_SEPARATOR}999`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe('/(.)john/photos/(.)999')
  })

  it('should NOT strip _NEXTSEP_ from user content', () => {
    // If the separator appears outside the interception marker context,
    // it should be preserved as it's part of user content
    const input = `/folder/my${PARAM_SEPARATOR}file/data${PARAM_SEPARATOR}value`
    const result = stripNormalizedSeparators(input)
    expect(result).toBe(
      `/folder/my${PARAM_SEPARATOR}file/data${PARAM_SEPARATOR}value`
    )
  })

  it('should only strip after closing paren, not before', () => {
    const input = `/path${PARAM_SEPARATOR}(.)${PARAM_SEPARATOR}value`
    const result = stripNormalizedSeparators(input)
    // Should only strip the one after ), not the one before
    expect(result).toBe(`/path${PARAM_SEPARATOR}(.)value`)
  })
})
