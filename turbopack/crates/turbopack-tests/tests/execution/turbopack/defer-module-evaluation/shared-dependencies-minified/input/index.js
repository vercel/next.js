import './setup.js'
import { usesFirst } from './uses-first.js'
import './between.js'
import { usesSecond } from './uses-second.js'
import { lazy } from './library/lazy.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readLazy() {
  return lazy.name
}

it('evaluates the modules that a deferred module shares with eager modules in import order', () => {
  // `lazy.js` imports `first.js` and `second.js`. It is deferred, and `second.js` still runs
  // after `between.js`, where it runs when `lazy.js` is not deferred.
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
