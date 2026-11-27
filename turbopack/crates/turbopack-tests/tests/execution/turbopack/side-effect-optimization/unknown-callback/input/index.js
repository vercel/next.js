import './promise.js'
import './map.js'

it('retains effects from callbacks referenced by identifiers', () => {
  expect(globalThis.unknownCallbackPromise).toBe('executed')
  expect(globalThis.unknownCallbackMap).toBe('executed')
})
