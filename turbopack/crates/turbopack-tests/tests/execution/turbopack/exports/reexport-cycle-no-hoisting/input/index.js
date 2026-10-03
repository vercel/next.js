import value from './module'

it('should re-export a value across a cycle without scope hoisting', () => {
  expect(value).toBe('ok')
})
