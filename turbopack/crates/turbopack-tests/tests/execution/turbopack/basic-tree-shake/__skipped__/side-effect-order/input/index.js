import { cat } from './lib'

// Fails: with module fragments the side effects of `lib.js` observe the final
// value of `dog` instead of the value at the point they appear in the source.
it('runs side effects in source order with module fragments', () => {
  expect(cat).toBe('cat')
  expect(globalThis.dogLogs).toEqual(['dog!', 'dog!!', 'dog!!!'])
})
