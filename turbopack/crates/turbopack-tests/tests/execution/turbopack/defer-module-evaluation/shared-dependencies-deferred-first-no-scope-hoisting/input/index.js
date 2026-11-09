import './setup.js'
import { lazy } from './library/lazy.js'
import { usesFirst } from './uses-first.js'
import './between.js'
import { usesSecond } from './uses-second.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readLazy() {
  return lazy.name
}

it('evaluates the modules that a deferred module imports first where eager modules import them', () => {
  // `lazy.js` imports `first.js` and `second.js` one after the other. It is deferred, so they
  // run where `uses-first.js` and `uses-second.js` import them, with `between.js` in between:
  // the two are not evaluated together although the deferred import comes first. (Without the
  // option both run at the import of `lazy.js`, see `stated-order-difference`.)
  expect(evaluatedBefore).toEqual([
    'first',
    'uses-first',
    'between',
    'second',
    'uses-second',
  ])
  expect(usesFirst.name + usesSecond.name).toBe('firstsecond')

  expect(readLazy()).toBe('firstsecond')
  expect(events.slice(evaluatedBefore.length)).toEqual(['lazy'])
})
