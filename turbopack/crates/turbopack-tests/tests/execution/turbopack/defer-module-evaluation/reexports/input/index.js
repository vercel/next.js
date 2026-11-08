import './setup.js'
import * as named from './reexports-named.js'
import * as star from './reexports-star.js'
import * as namespace from './reexports-namespace.js'
import * as local from './reexports-local.js'
import { throughStar } from './library/barrel-star.js'
import { throughNamed } from './library/barrel-named.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function evaluations(name) {
  return events.filter((event) => event === name).length
}

function readThroughStar() {
  return throughStar
}

function readThroughNamed() {
  return throughNamed
}

// A module needs the bindings that it re-exports for its own namespace object, which this module
// uses as a whole. So the re-exported module is evaluated with the module that re-exports it.

it('does not defer a module for the module that re-exports a binding of it', () => {
  expect(evaluatedBefore).toContain('reexports-named')
  expect(evaluatedBefore).toContain('named-target')
  expect(Object.keys(named)).toEqual(['named'])
  expect(named.named).toBe('named')
})

it('does not defer a module for the module that re-exports it with `export *`', () => {
  expect(evaluatedBefore).toContain('reexports-star')
  expect(evaluatedBefore).toContain('star-target')
  expect(Object.keys(star)).toEqual(['star'])
  expect(star.star).toBe('star')
})

it('does not defer a module for the module that re-exports its namespace', () => {
  expect(evaluatedBefore).toContain('reexports-namespace')
  expect(evaluatedBefore).toContain('namespace-target')
  expect(Object.keys(namespace)).toEqual(['target'])
  expect(Object.keys(namespace.target)).toEqual(['value'])
  expect(namespace.target.value).toBe('namespace')
})

it('does not defer a module for the module that imports and then exports a binding of it', () => {
  expect(evaluatedBefore).toContain('reexports-local')
  expect(evaluatedBefore).toContain('local-target')
  expect(Object.keys(local).sort()).toEqual(['local', 'readLocal'])
  expect(local.local).toBe('local')
  expect(local.readLocal()).toBe('local')
})

it('defers an import through a side-effect-free module that re-exports with `export *`', () => {
  expect(evaluatedBefore).not.toContain('barrel-star-target')
  expect(evaluations('barrel-star-target')).toBe(0)
  expect(readThroughStar()).toBe('through-star')
  expect(readThroughStar()).toBe('through-star')
  expect(evaluations('barrel-star-target')).toBe(1)
})

it('defers an import through a side-effect-free module that re-exports a binding', () => {
  expect(evaluatedBefore).not.toContain('barrel-named-target')
  expect(evaluations('barrel-named-target')).toBe(0)
  expect(readThroughNamed()).toBe('through-named')
  expect(readThroughNamed()).toBe('through-named')
  expect(evaluations('barrel-named-target')).toBe(1)
})
