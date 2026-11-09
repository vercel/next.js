import './setup.js'
import { listed, unlisted } from './side-effects-array/barrel.js'
import { undeclared } from './library/barrel.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function evaluations(name) {
  return events.filter((event) => event === name).length
}

function readListed() {
  return listed
}

function readUnlisted() {
  return unlisted
}

function readUndeclared() {
  return undeclared
}

// An import through a side-effect-free module that only re-exports refers to the module behind it,
// and the import of the re-exporting module itself is removed. So for a module behind it, only the
// side-effect-free set decides whether it is evaluated before this module.

it('evaluates a file that the `sideEffects` array lists before its importer, through a module that re-exports it', () => {
  expect(evaluatedBefore).toContain('listed')
  expect(readListed()).toBe('listed')
  expect(evaluations('listed')).toBe(1)
})

it('evaluates a module with a side effect before its importer, through a module of a `sideEffects: false` package that re-exports it', () => {
  expect(evaluatedBefore).toContain('undeclared-effect')
  expect(readUndeclared()).toBe('undeclared-effect')
  expect(evaluations('undeclared-effect')).toBe(1)
})

it('defers a file that the `sideEffects` array does not list, through the same module', () => {
  expect(evaluatedBefore).not.toContain('unlisted')
  expect(evaluations('unlisted')).toBe(0)
  expect(readUnlisted()).toBe('unlisted')
  expect(readUnlisted()).toBe('unlisted')
  expect(evaluations('unlisted')).toBe(1)
})
