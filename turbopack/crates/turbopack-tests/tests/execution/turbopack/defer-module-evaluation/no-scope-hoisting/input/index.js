import './setup.js'
import { effect } from './effectful.js'
import { value, count, increment } from './library/lazy.js'

const evaluatedBefore = [...globalThis.deferEvents]

function readValue() {
  return value
}

function readCount() {
  return count
}

it('evaluates a module without side effects on the first read of an export', () => {
  expect(evaluatedBefore).toEqual(['effectful'])
  expect(effect()).toBe('effect')

  expect(readValue()).toBe('lazy')
  expect(globalThis.deferEvents).toEqual(['effectful', 'lazy'])

  expect(readCount()).toBe(0)
  increment()
  expect(readCount()).toBe(1)
  expect(globalThis.deferEvents).toEqual(['effectful', 'lazy'])
})
