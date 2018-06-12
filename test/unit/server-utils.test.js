/* global describe, it, expect */

import { getChunkNameFromFilename } from '../../dist/server/utils'

describe('Server utils', () => {
  describe('getChunkNameFromFilename', () => {
    it('should strip the hash from the filename', () => {
      const filename = 'foo_bar_0123456789abcdef-0123456789abcdef.js'
      expect(getChunkNameFromFilename(filename)).toBe('foo_bar_0123456789abcdef')
    })

    it('should only strip the part after the last hyphen in the filename', () => {
      const filename = 'foo-bar-0123456789abcdef-0123456789abcdef.js'
      expect(getChunkNameFromFilename(filename)).toBe('foo-bar-0123456789abcdef')
    })
  })
})
