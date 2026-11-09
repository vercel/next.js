import './setup.js'
import { first } from './library/first.js'
import { second } from './library/second.js'
import { effect } from './effectful.js'
import { third } from './library/third.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readFirst() {
  return first
}

function readSecond() {
  return second
}

function readThird() {
  return third
}

it('evaluates deferred modules in the order of their first read', () => {
  // Only the module with side effects was evaluated with this module.
  expect(evaluatedBefore).toEqual(['effectful'])
  expect(effect()).toBe('effect')

  expect(readThird()).toBe('third')
  // A deferred module evaluates its own imports first.
  expect(events).toEqual(['effectful', 'third-dependency', 'third'])

  expect(readFirst()).toBe('first')
  expect(readSecond()).toBe('second')
  expect(readThird()).toBe('third')
  expect(events).toEqual([
    'effectful',
    'third-dependency',
    'third',
    'first',
    'second',
  ])
})
