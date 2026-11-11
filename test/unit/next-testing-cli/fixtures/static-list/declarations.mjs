import { test as check, describe as group } from 'vitest'
import * as api from 'vitest'
if (globalThis) throw new Error('spec evaluated')
group('outer', () => {
  check('aliased', () => {
    throw new Error('body ran')
  })
  api.test('namespace', () => {
    throw new Error('body ran')
  })
  check.each([1, 2])('row %i', () => {
    throw new Error('body ran')
  })
  check.skipIf(false)('statically conditional', () => {})
})
// test('comment is not a declaration', () => {})
const fake = "test('string is not a declaration', () => {})"
void fake
