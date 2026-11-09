import './setup.js'
import { lazy } from './library/lazy.js'
import './set-mode.js'
import { usesConfig } from './uses-config.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readLazy() {
  return lazy.name
}

it('evaluates a module that a deferred module imports first at its later eager import', () => {
  // A stated difference of the option. `lazy.js` is declared free of side effects and imports
  // `config.js`. Without the option, `config.js` runs at the import of `lazy.js`, before
  // `set-mode.js` (the `stated-order-difference-option-off` fixtures). With it, `lazy.js` is
  // deferred, and `config.js` runs where `uses-config.js` imports it, after `set-mode.js`. That
  // is where it runs without the option when the import of `lazy.js` is not used
  // (`stated-order-difference-unused-import`).
  expect(evaluatedBefore).toEqual(['set-mode', 'config', 'uses-config'])
  expect(usesConfig.mode).toBe('custom')

  expect(readLazy()).toBe('lazy:custom')
  expect(events.slice(evaluatedBefore.length)).toEqual(['lazy'])
})
