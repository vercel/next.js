import { a as a9, b as b9 } from 'package-partial'
import { effects } from 'package-partial/effect'
it('should handle globs in sideEffects field', () => {
  expect(a9).toBe('a')
  expect(b9).toBe('b')
  expect(effects).toEqual([
    'file.side.js',
    'sub/file.side.js',
    'sub/bare.js',
    'dir/file.js',
  ])
})
