/* global describe, it, expect */

import { getChunkNameFromFilename } from '../../dist/server/utils'

describe('Server utils', () => {
  describe('getChunkNameFromFilename', () => {
    describe('development mode (no chunkhash)', () => {
      it('should strip the extension from the filename', () => {
        const filename = 'foo_bar_0123456789abcdef.js'
        expect(getChunkNameFromFilename(filename, true)).toBe('foo_bar_0123456789abcdef')
      })

      it('should only strip the extension even if there\'s a hyphen in the name', () => {
        const filename = 'foo-bar-0123456789abcdef.js'
        expect(getChunkNameFromFilename(filename, true)).toBe('foo-bar-0123456789abcdef')
      })
    })

    describe('production mode (with chunkhash)', () => {
      it('should strip the hash from the filename', () => {
        const filename = 'foo_bar_0123456789abcdef-0123456789abcdef.js'
        expect(getChunkNameFromFilename(filename, false)).toBe('foo_bar_0123456789abcdef')
      })

      it('should only strip the part after the last hyphen in the filename', () => {
        const filename = 'foo-bar-0123456789abcdef-0123456789abcdef.js'
        expect(getChunkNameFromFilename(filename, false)).toBe('foo-bar-0123456789abcdef')
      })
    })
  })
})
