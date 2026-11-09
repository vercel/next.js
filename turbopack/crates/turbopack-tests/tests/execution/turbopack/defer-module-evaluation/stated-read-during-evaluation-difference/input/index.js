import './setup.js'
import { value, heardAtEvaluation } from './library/emitter.js'
import { readInListener, callInListener } from './listener.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

function readEmitter() {
  return { value, heardAtEvaluation }
}

it('gives a read of a deferred module during its evaluation a namespace without exports, for good', () => {
  // A stated difference of the option: this pins what happens, it does not endorse it.
  // `emitter.js` is declared free of side effects and calls the listeners while it is evaluated,
  // and the listener of `listener.js` reads `emitter.js`. Without the option, `emitter.js` runs
  // before `listener.js` registers the listener
  // (`stated-read-during-evaluation-difference-option-off`). With it, both imports are deferred,
  // and the first read evaluates `emitter.js` when the listener is registered.
  expect(evaluatedBefore).toEqual(['listener'])

  // The listener reads `emitter.js` halfway: its exports are registered when it ends.
  expect(readEmitter()).toEqual({
    value: { name: 'value' },
    heardAtEvaluation: [undefined],
  })
  expect(events).toEqual(['listener', 'emitter'])

  // `listener.js` keeps the namespace object that it got then: its reads stay `undefined` and
  // its calls throw, also after the evaluation has ended.
  for (let i = 0; i < 2; i++) {
    expect(readInListener()).toBe(undefined)
    expect(callInListener).toThrow(TypeError)
  }
  // A module that reads `emitter.js` after its evaluation gets the exports.
  expect(readEmitter().value).toEqual({ name: 'value' })
  expect(events).toEqual(['listener', 'emitter'])
})
