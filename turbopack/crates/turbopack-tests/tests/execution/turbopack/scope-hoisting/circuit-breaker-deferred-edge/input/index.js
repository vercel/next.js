import { deferredValue, loadEntry } from './deferred.js'

export const entryValue = 'entry'

it('does not need a circuit breaker for a deferred cycle', () => {
  expect(deferredValue).toBe('deferred')
  expect(loadEntry()).toBe('entry')
})
