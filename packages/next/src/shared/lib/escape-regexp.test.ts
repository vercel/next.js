import { escapeStringRegexp } from './escape-regexp'

describe('shared/lib/escape-regexp', () => {
  describe('escapeStringRegexp', () => {
    it('should escape special regex characters', () => {
      expect(escapeStringRegexp('.')).toBe('\\.')
      expect(escapeStringRegexp('*')).toBe('\\*')
      expect(escapeStringRegexp('+')).toBe('\\+')
      expect(escapeStringRegexp('?')).toBe('\\?')
      expect(escapeStringRegexp('^')).toBe('\\^')
      expect(escapeStringRegexp('$')).toBe('\\$')
      expect(escapeStringRegexp('{')).toBe('\\{')
      expect(escapeStringRegexp('}')).toBe('\\}')
      expect(escapeStringRegexp('(')).toBe('\\(')
      expect(escapeStringRegexp(')')).toBe('\\)')
      expect(escapeStringRegexp('|')).toBe('\\|')
      expect(escapeStringRegexp('[')).toBe('\\[')
      expect(escapeStringRegexp(']')).toBe('\\]')
      expect(escapeStringRegexp('\\')).toBe('\\\\')
      expect(escapeStringRegexp('-')).toBe('\\-')
    })

    it('should not escape regular characters', () => {
      expect(escapeStringRegexp('hello')).toBe('hello')
      expect(escapeStringRegexp('world')).toBe('world')
      expect(escapeStringRegexp('abc123')).toBe('abc123')
    })

    it('should escape multiple special characters', () => {
      expect(escapeStringRegexp('hello.world')).toBe('hello\\.world')
      expect(escapeStringRegexp('(test)')).toBe('\\(test\\)')
      expect(escapeStringRegexp('[a-z]')).toBe('\\[a\\-z\\]')
      expect(escapeStringRegexp('a*b+c?')).toBe('a\\*b\\+c\\?')
    })

    it('should handle mixed content', () => {
      expect(escapeStringRegexp('hello.world*')).toBe('hello\\.world\\*')
      expect(escapeStringRegexp('test(123)')).toBe('test\\(123\\)')
      expect(escapeStringRegexp('file[1-5].txt')).toBe('file\\[1\\-5\\]\\.txt')
    })

    it('should handle empty string', () => {
      expect(escapeStringRegexp('')).toBe('')
    })

    it('should handle strings with only special characters', () => {
      expect(escapeStringRegexp('.*+?^${}()|[]\\')).toBe(
        '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
      )
    })

    it('should produce valid regex patterns', () => {
      const testStrings = [
        'hello.world',
        'test*file',
        'path/to/file.txt',
        '[a-z]+',
        '(group)',
        'a|b',
        'end$',
        '^start',
      ]

      for (const str of testStrings) {
        const escaped = escapeStringRegexp(str)
        const regex = new RegExp(escaped)

        // The escaped string should match itself exactly
        expect(regex.test(str)).toBe(true)

        // It should not match variations with different special chars
        if (str.includes('.')) {
          expect(regex.test(str.replace('.', 'x'))).toBe(false)
        }
      }
    })

    it('should handle URLs', () => {
      const url = 'https://example.com/path?query=value'
      const escaped = escapeStringRegexp(url)
      const regex = new RegExp(escaped)

      expect(regex.test(url)).toBe(true)
      expect(regex.test('https://example.com/path')).toBe(false)
    })

    it('should handle file paths', () => {
      const path = 'C:\\Users\\file.txt'
      const escaped = escapeStringRegexp(path)
      const regex = new RegExp(escaped)

      expect(regex.test(path)).toBe(true)
    })

    it('should handle glob patterns', () => {
      const glob = '**/*.{js,ts}'
      const escaped = escapeStringRegexp(glob)

      expect(escaped).toBe('\\*\\*\\/\\*\\.\\{js,ts\\}')

      const regex = new RegExp(escaped)
      expect(regex.test(glob)).toBe(true)
    })

    it('should be idempotent for strings without special chars', () => {
      const str = 'normalstring'
      expect(escapeStringRegexp(escapeStringRegexp(str))).toBe(str)
    })

    it('should handle unicode characters', () => {
      expect(escapeStringRegexp('hello 世界')).toBe('hello 世界')
      expect(escapeStringRegexp('emoji 😀')).toBe('emoji 😀')
    })

    it('should handle newlines and tabs', () => {
      expect(escapeStringRegexp('line1\nline2')).toBe('line1\nline2')
      expect(escapeStringRegexp('col1\tcol2')).toBe('col1\tcol2')
    })

    it('should escape correctly for use in RegExp constructor', () => {
      const specialChars = '.*+?^${}()|[]\\'
      const escaped = escapeStringRegexp(specialChars)

      // Should not throw
      expect(() => new RegExp(escaped)).not.toThrow()

      // Should match the original string literally
      const regex = new RegExp(escaped)
      expect(regex.test(specialChars)).toBe(true)
    })
  })
})
