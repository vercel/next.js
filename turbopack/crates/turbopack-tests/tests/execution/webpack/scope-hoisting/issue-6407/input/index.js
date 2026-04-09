import importOne from './import-one'
import importTwo from './import-two'

it('should concatenate modules default exports and empty array values', function () {
  expect(importOne.length).toBe(2)
  expect(typeof importOne[0]).toBe('undefined')
  expect(typeof importOne[1]).toBe('function')
  expect(importTwo.length).toBe(2)
  expect(typeof importTwo[0]).toBe('undefined')
  expect(typeof importTwo[1]).toBe('function')
})
