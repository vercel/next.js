import './setup.js'
import { value } from './library/async.js'
import { readAsync } from './library/imports-async.js'
import { a as externalValue } from 'esm-external/package'
import { readExternal } from './library/imports-esm-external.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

function readExternalValue() {
  return externalValue
}

it('evaluates an async module, and a module that imports one, before its importer', () => {
  expect(evaluatedBefore).toContain('async')
  expect(evaluatedBefore).toContain('imports-async')
  expect(evaluatedBefore.indexOf('async')).toBeLessThan(
    evaluatedBefore.indexOf('imports-async')
  )
  expect(readValue()).toBe('async')
  expect(readAsync()).toBe('async')
})

it('evaluates a module that imports an ES module external before its importer', () => {
  expect(evaluatedBefore).toContain('imports-esm-external')
  expect(readExternal()).toBe('a')
  expect(readExternalValue()).toBe('a')
  expect(globalThis.deferEvents).toEqual(evaluatedBefore)
})
