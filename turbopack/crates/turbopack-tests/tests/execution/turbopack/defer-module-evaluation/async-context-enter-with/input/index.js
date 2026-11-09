import './setup.js'
import { atEvaluation as entersAtEvaluation, nested } from './library/enters.js'
import { atEvaluation as laterAtEvaluation } from './library/later.js'

const events = globalThis.deferEvents
const request = globalThis.deferRequest
const evaluatedBefore = [...events]

function readEnters() {
  return [entersAtEvaluation, nested]
}

function readLater() {
  return laterAtEvaluation
}

it('keeps a store that a deferred module enters at its top level inside that evaluation', () => {
  expect(evaluatedBefore).toEqual([])
  // `enters.js` sees its own store. `nested.js`, which it evaluates, does not.
  expect(request.run('request 1', readEnters)).toEqual([
    'entered by enters.js',
    undefined,
  ])
  expect(events).toEqual(['enters', 'nested'])
  expect(request.getStore()).toBe(undefined)
  // Nor does a deferred module that is evaluated later. Before Node.js 24 `enterWith()` keeps the
  // store on the async resource that is current, so each evaluation needs one of its own.
  expect(readLater()).toBe(undefined)
  expect(request.run('request 2', readLater)).toBe(undefined)
  expect(events).toEqual(['enters', 'nested', 'later'])
})
