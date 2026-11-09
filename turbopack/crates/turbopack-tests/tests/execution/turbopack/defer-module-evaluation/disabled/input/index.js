import './setup.js'
import { value } from './library/lazy.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

it('evaluates a module without side effects before its importer by default', () => {
  expect(evaluatedBefore).toEqual(['lazy'])
  expect(readValue()).toBe('lazy')
  expect(globalThis.deferEvents).toEqual(['lazy'])
})
