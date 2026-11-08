import './setup.js'
import * as members from './library/members.js'
import * as passed from './library/passed.js'
import * as spread from './library/spread.js'
import * as inOperator from './library/in-operator.js'
import * as dynamicKey from './library/dynamic-key.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function identity(value) {
  return value
}

function readMembers() {
  return members.a + members.b
}

function readPassed() {
  return identity(passed).a
}

function readSpread() {
  return { ...spread }
}

function readIn(key) {
  return key in inOperator
}

function readDynamicKey(key) {
  return dynamicKey[key]
}

it('defers a namespace import that is only read through static members', () => {
  expect(evaluatedBefore).not.toContain('members')
  expect(readMembers()).toBe(3)
  expect(events.filter((event) => event === 'members')).toEqual(['members'])
})

// The namespace object itself is used: the module is evaluated before its importer.

it('does not defer a namespace import that is passed to a function', () => {
  expect(evaluatedBefore).toContain('passed')
  expect(readPassed()).toBe(1)
})

it('does not defer a namespace import that is spread', () => {
  expect(evaluatedBefore).toContain('spread')
  expect(readSpread()).toEqual({ a: 1 })
})

it('does not defer a namespace import that is the operand of `in`', () => {
  expect(evaluatedBefore).toContain('in-operator')
  expect(readIn('a')).toBe(true)
  expect(readIn('b')).toBe(false)
})

it('does not defer a namespace import that is read with a dynamic key', () => {
  expect(evaluatedBefore).toContain('dynamic-key')
  expect(readDynamicKey('a')).toBe(1)
})
