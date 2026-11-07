import './setup.js'
import { value } from './library/async.js'
import { readAsync } from './library/imports-async.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

it('evaluates an async module, and a module that imports one, before its importer', () => {
  expect(evaluatedBefore).toEqual(['async', 'imports-async'])
  expect(readValue()).toBe('async')
  expect(readAsync()).toBe('async')
})
