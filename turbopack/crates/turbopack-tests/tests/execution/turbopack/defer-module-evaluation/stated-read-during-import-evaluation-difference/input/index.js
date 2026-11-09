import './setup.js'
import { readInListener, callInListener } from './listener.js'
import { heardAtEvaluation } from './emitter.js'

const events = globalThis.deferEvents
const evaluatedBefore = [...events]

it('evaluates a deferred module that is first read during the evaluation of its import before that import has exports', () => {
  // A stated difference of the option: this pins what happens, it does not endorse it.
  // `uses-emitter.js` is declared free of side effects and imports `emitter.js`, which calls the
  // listeners while it is evaluated, and the listener of `listener.js` reads `uses-emitter.js`.
  // Without the option, both run before `listener.js` registers the listener
  // (`stated-read-during-import-evaluation-difference-option-off`). With it, `uses-emitter.js`
  // is deferred, and the listener is its first read: it runs while `emitter.js` is evaluated,
  // not after it.
  expect(evaluatedBefore).toEqual(['listener', 'emitter', 'uses-emitter'])

  // `uses-emitter.js` reads `emitter.js` halfway: its exports are registered when it ends.
  expect(heardAtEvaluation).toEqual([{ settings: undefined }])

  // `uses-emitter.js` keeps the namespace object that it got then: what it copied stays
  // `undefined` for every reader, and its calls into `emitter.js` throw.
  for (let i = 0; i < 2; i++) {
    expect(readInListener()).toEqual({ settings: undefined })
    expect(callInListener).toThrow(TypeError)
  }
  expect(events).toEqual(evaluatedBefore)
})
