import './setup.js'
import { value, heardAtEvaluation } from './library/emitter.js'
import { readInListener, callInListener } from './listener.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readEmitter() {
  return { value, heardAtEvaluation }
}

it('evaluates a module before a module that registers a listener reading it by default', () => {
  // The other side of the stated difference (`stated-read-during-evaluation-difference`): without
  // the option, `emitter.js` runs before `listener.js`, so it calls no listener, and nothing
  // reads it before its exports are registered.
  expect(evaluatedBefore).toEqual(['emitter', 'listener'])

  expect(readEmitter()).toEqual({
    value: { name: 'value' },
    heardAtEvaluation: [],
  })
  expect(readInListener()).toEqual({ name: 'value' })
  expect(callInListener()).toBe('called emitter.js')
  expect(events).toEqual(evaluatedBefore)
})
