import value, { self as moduleSelf } from './module'
export var self = require('./')

it('should have the correct values', function () {
  expect(value).toBe('default')
  expect(moduleSelf).toBe(self)
  expect(self.self).toBe(self)
})
