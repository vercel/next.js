it('should be able to import a module via require and property', () => {
  expect(require('./module').abc).toBe('abc')
})

it('should be able to import a module via require and destruct', () => {
  var { abc } = require('./module')
  expect(abc).toBe('abc')
})

it('should be able to import a module via require and exports object', () => {
  var module1 = require('./module')
  expect(module1.abc).toBe('abc')
  var module2 = require('./module')
  expect(module2).toEqual({ abc: 'abc', def: 'def' })
})
