import './setup.js'
import { readDependency } from './library/imports-effect.js'
import { listed } from './side-effects-array/listed.js'
import { unlisted } from './side-effects-array/unlisted.js'
import { directive } from './directive.js'
import { inferred } from './inferred.js'
import { inferredImportsEffect } from './inferred-imports-effect.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function evaluatedOf(...names) {
  return events.filter((event) => names.includes(event))
}

function readListed() {
  return listed
}

function readUnlisted() {
  return unlisted
}

function readDirective() {
  return directive
}

function readInferred() {
  return inferred
}

function readInferredImportsEffect() {
  return inferredImportsEffect
}

// The set of modules that can be evaluated late is the one that removes an unused import.

it('defers a module that its package declares side effect free, with the side effects of what it imports', () => {
  expect(evaluatedBefore).not.toContain('imports-effect')
  expect(evaluatedBefore).not.toContain('dependency-with-effect')

  // The first read evaluates the module, and with it the module that it imports.
  expect(readDependency()).toBe('dependency')
  expect(evaluatedOf('dependency-with-effect', 'imports-effect')).toEqual([
    'dependency-with-effect',
    'imports-effect',
  ])

  expect(readDependency()).toBe('dependency')
  expect(evaluatedOf('dependency-with-effect', 'imports-effect')).toEqual([
    'dependency-with-effect',
    'imports-effect',
  ])
})

it('evaluates a file that the `sideEffects` array of its package lists before its importer', () => {
  expect(evaluatedBefore).toContain('listed')
  expect(readListed()).toBe('listed')
})

it('defers a file that the `sideEffects` array of its package does not list', () => {
  expect(evaluatedBefore).not.toContain('unlisted')
  expect(readUnlisted()).toBe('unlisted')
  expect(events).toContain('unlisted')
})

it('defers a module with the "no side effects" directive', () => {
  expect(evaluatedBefore).not.toContain('directive')
  expect(readDirective()).toBe('directive')
  expect(events).toContain('directive')
})

it('defers a module that the analysis finds side effect free when its imports are too', () => {
  expect(evaluatedBefore).not.toContain('imported-by-inferred')
  expect(readInferred()).toBe('imported-by-inferred')
  expect(events).toContain('imported-by-inferred')
})

it('evaluates a module that the analysis finds side effect free before its importer when it imports a side effect', () => {
  expect(evaluatedBefore).toContain('effect-of-inferred')
  expect(readInferredImportsEffect()).toBe('effect-of-inferred')
})
