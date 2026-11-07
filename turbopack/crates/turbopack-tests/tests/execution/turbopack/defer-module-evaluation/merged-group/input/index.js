import './setup.js'
// These two modules are read below while this module is evaluated, so they are merged with it.
// The first one defers its own import of `shared.js`, the second one reads the same module while
// it is evaluated.
import { readLater } from './reads-later.js'
import { readNow } from './reads-now.js'

const later = readLater
const now = readNow
const evaluatedBefore = [...globalThis.deferEvents]

it('keeps a deferred and an eager import of the same module apart in a merged group', () => {
  expect(evaluatedBefore).toEqual(['shared'])
  expect(now).toBe('shared')
  expect(later()).toBe('shared')
  expect(globalThis.deferEvents).toEqual(['shared'])
})
