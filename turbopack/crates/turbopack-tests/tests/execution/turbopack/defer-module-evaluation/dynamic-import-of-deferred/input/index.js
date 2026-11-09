import './setup.js'
import { value } from './library/lazy.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readValue() {
  return value
}

function loadValue() {
  return import('./library/lazy.js')
}

it('defers a module that the importer also loads with import()', async () => {
  // Without `followReexports`, the static import and the `import()` reach the same module. (With
  // it, a named import reaches the part of the module that holds its own exports.) An `import()`
  // does not evaluate the module before the importer, so the static import is still deferred.
  expect(evaluatedBefore).toEqual([])
  expect(readValue()).toBe('lazy')
  expect((await loadValue()).value).toBe('lazy')
  expect(events).toEqual(['lazy'])
})
