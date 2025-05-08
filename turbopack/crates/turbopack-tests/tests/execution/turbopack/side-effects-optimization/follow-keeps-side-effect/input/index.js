import getValue from './reexport.js'

it('should not optimize away side effects', () => {
  expect(getValue()).toBe(42)
})
