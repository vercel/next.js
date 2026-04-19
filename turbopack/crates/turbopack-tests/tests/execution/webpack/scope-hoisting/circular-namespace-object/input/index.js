import value from './module'

it('should have access to namespace object before evaluation', function () {
  expect(value).toBe('ok')
})
