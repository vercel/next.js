import './setup.js'
import { effect } from './effectful.js'
import defaultExport, { value, count, increment } from './library/lazy.js'
import { never } from './library/throws.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

function readCount() {
  return count
}

function readDefault() {
  return defaultExport
}

function readNever() {
  return never
}

it('defers the evaluation of a module in minified output with numeric module ids', () => {
  expect(evaluatedBefore).toEqual(['effectful'])
  expect(effect()).toBe('effect')

  expect(readValue()).toBe('lazy')
  expect(readDefault()).toBe('default')
  expect(globalThis.deferEvents).toEqual(['effectful', 'lazy'])

  expect(readCount()).toBe(0)
  increment()
  expect(readCount()).toBe(1)

  expect(readNever).toThrow('thrown by throws.js')
  expect(readNever).toThrow('thrown by throws.js')
  expect(globalThis.deferEvents).toEqual(['effectful', 'lazy', 'throws'])
})
