import './setup.js'
import { usesBase } from './uses-base.js'
import './between.js'
import { readsLazy } from './reads-lazy.js'
import { lazy } from './library/lazy.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readLazy() {
  return lazy.name
}

it('evaluates a module that another importer reads eagerly where that importer imports it', () => {
  // This module reads `lazy.js` only inside a function. `reads-lazy.js` reads it while it is
  // evaluated, so `lazy.js` and `effect.js` run there, after `uses-base.js` and `between.js`.
  expect(evaluatedBefore).toEqual([
    'base',
    'uses-base',
    'between',
    'effect',
    'lazy',
    'reads-lazy',
  ])
  expect(usesBase.name + readsLazy.name).toBe('baseeffectbase')

  expect(readLazy()).toBe('effectbase')
  expect(events).toEqual(evaluatedBefore)
})
