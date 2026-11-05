// `other.js` is imported (and executed) first so that, if `direct.js` were merged,
// its colliding `local` would be the one that gets renamed.
import { otherLocal } from './other.js'
import { readLocal, readNested } from './direct.js'
import { indirect } from './indirect.js'

const local = 'index'

function hasOwnFactory(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.includes(`/input/${file} `)
  )
}

it('should not merge modules using direct eval', () => {
  expect(readLocal()).toBe('direct')
  expect(readNested()).toBe('direct')
  expect(otherLocal).toBe('other')
  expect(local).toBe('index')
  expect(hasOwnFactory('direct.js')).toBe(true)
})

it('should still merge modules using only indirect eval', () => {
  // Indirect evals run in the global scope.
  expect(indirect).toEqual([1, 2, 3, 'indirect'])
  expect(hasOwnFactory('indirect.js')).toBe(false)
})
