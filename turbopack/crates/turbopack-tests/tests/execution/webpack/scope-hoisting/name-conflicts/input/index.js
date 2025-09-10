import value1 from './module?('
import value2 from './module?)'
import value3 from './module?['
import value4 from './module?]'
import value5 from './module?{'
import value6 from './module?}'

it('should not break on name conflicts', function () {
  expect(value1).toBe('a')
  expect(value2).toBe('a')
  expect(value3).toBe('a')
  expect(value4).toBe('a')
  expect(value5).toBe('a')
  expect(value6).toBe('a')
})
