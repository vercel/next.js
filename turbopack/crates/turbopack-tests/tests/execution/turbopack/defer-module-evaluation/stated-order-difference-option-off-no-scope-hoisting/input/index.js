import './setup.js'
import { lazy } from './library/lazy.js'
import './set-mode.js'
import { usesConfig } from './uses-config.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readLazy() {
  return lazy.name
}

it('evaluates a module that a used import reaches first at that import by default', () => {
  // The other side of the stated difference (`stated-order-difference`): without the option,
  // `lazy.js` and `config.js` run at the import of `lazy.js`, before `set-mode.js`.
  expect(evaluatedBefore).toEqual(['config', 'lazy', 'set-mode', 'uses-config'])
  expect(usesConfig.mode).toBe('default')

  expect(readLazy()).toBe('lazy:default')
  expect(events).toEqual(evaluatedBefore)
})
