import a from './a.js'

it('should support ESM imports and CJS exports in the same file', () => {
  expect(a()).toBe(1234)
})
