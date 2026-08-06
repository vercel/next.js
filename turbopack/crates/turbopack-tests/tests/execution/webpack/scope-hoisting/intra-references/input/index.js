import value from './a'

it('should have the correct values', function () {
  expect(value).toBe('ok')
})

// prevent scope hoisting of b
require('./b')
