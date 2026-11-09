import './setup.js'
import { value } from './library/lazy.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

it('defers nothing when unused imports are not removed', () => {
  // Deferring is tied to the removal of unused imports (`removeUnusedImports`). Without it, an
  // import is evaluated before its importer as usual.
  expect(evaluatedBefore).toEqual(['lazy'])
  expect(readValue()).toBe('lazy')
  expect(globalThis.deferEvents).toEqual(['lazy'])
})
