import value from './module'

it('should not cause name conflicts', function () {
  expect(typeof value).toBe('undefined')
})
