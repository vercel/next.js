import './setup.js'
// These two modules are read below while this module is evaluated, so they are merged with it.
// The first one defers its own import of `shared.js`, the second one reads the same module while
// it is evaluated.
import { readLater, readCountLater } from './reads-later.js'
import { readNow, incrementNow } from './reads-now.js'

const later = readLater
const now = readNow
const evaluatedBefore = [...globalThis.deferEvents]

it('keeps a deferred and an eager import of the same module apart in a merged group', () => {
  expect(evaluatedBefore).toEqual(['shared'])
  expect(now).toBe('shared')
  expect(later()).toBe('shared')
  expect(globalThis.deferEvents).toEqual(['shared'])
})

it('reads the current value of a binding that changed before the first deferred read', () => {
  // `reads-now.js` incremented it while it was evaluated.
  expect(readCountLater()).toBe(1)
  incrementNow()
  expect(readCountLater()).toBe(2)
  expect(globalThis.deferEvents).toEqual(['shared'])
})
