// `other.js` is imported (and executed) first so that, if `direct.js` were merged,
// its colliding `local` would be the one that gets renamed.
import { otherLocal } from './other.js'
import { readLocal, readNested } from './direct.js'

const local = 'index'

it('should not merge modules using direct eval', () => {
  expect(readLocal()).toBe('direct')
  expect(readNested()).toBe('direct')
  expect(otherLocal).toBe('other')
  expect(local).toBe('index')
})
