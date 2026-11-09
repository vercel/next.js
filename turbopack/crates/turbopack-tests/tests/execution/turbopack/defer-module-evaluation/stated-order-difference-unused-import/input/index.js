import './setup.js'
import { lazy } from './library/lazy.js'
import './set-mode.js'
import { usesConfig } from './uses-config.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

// Nothing calls this function, so the import of `lazy.js` is not used.
function readLazy() {
  return lazy.name
}

it('evaluates a module that an unused import reaches first at its later import by default', () => {
  // Without the option. `lazy.js` is declared free of side effects and its import is not used,
  // so the import is removed, and `config.js` runs where `uses-config.js` imports it, after
  // `set-mode.js`. The option gives the same order to an import that is used later
  // (`stated-order-difference`).
  expect(evaluatedBefore).toEqual(['set-mode', 'config', 'uses-config'])
  expect(usesConfig.mode).toBe('custom')
  expect(events).toEqual(evaluatedBefore)
})
