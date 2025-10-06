import value, { named } from './module'

it('should have the correct values', function () {
  expect(value).toBe('default')
  expect(named).toBe('named')
})
