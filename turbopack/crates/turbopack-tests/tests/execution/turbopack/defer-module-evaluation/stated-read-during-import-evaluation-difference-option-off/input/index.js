import './setup.js'
import { readInListener, callInListener } from './listener.js'
import { heardAtEvaluation } from './emitter.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

it('evaluates a module after its import, before a module that registers a listener reading it, by default', () => {
  // The other side of the stated difference (`stated-read-during-import-evaluation-difference`):
  // without the option, `emitter.js` and then `uses-emitter.js` run before `listener.js`, so
  // `emitter.js` calls no listener, and `uses-emitter.js` reads it after its exports are
  // registered.
  expect(evaluatedBefore).toEqual(['emitter', 'uses-emitter', 'listener'])

  expect(heardAtEvaluation).toEqual([])
  expect(readInListener()).toEqual({ settings: { level: 'info' } })
  expect(callInListener()).toBe('emitter: text')
  expect(events).toEqual(evaluatedBefore)
})
