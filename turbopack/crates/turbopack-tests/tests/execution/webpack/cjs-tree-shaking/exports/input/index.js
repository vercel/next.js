it('should allow to export via exports', () => {
  expect(require('./assign-exports-property').abc).toBe('abc')
  expect(require('./assign-exports-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to export via module.exports', () => {
  expect(require('./assign-module-exports-property').abc).toBe('abc')
  expect(require('./assign-module-exports-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to export via this', () => {
  expect(require('./assign-this-property').abc).toBe('abc')
  expect(require('./assign-this-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to export via define property on exports', () => {
  expect(require('./define-exports-property').abc).toBe('abc')
  expect(require('./define-exports-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to export via define property on module.exports', () => {
  expect(require('./define-module-exports-property').abc).toBe('abc')
  expect(require('./define-module-exports-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to export via define property on this', () => {
  expect(require('./define-this-property').abc).toBe('abc')
  expect(require('./define-this-property')).toEqual({
    abc: 'abc',
    def: 'def',
  })
})

it('should allow to read own exports via exports', () => {
  var test = require('./reading-self-from-exports').test
  expect(test()).toBe('abc')
})

it('should allow to read own exports via module.exports', () => {
  var test = require('./reading-self-from-module-exports').test
  expect(test()).toBe('abc')
})

it('should allow to read own exports via this', () => {
  var test = require('./reading-self-from-this').test
  expect(test()).toBe('abc')
})

it('should allow to attach exports to object', () => {
  expect(require('./attach-to-object').abc).toBe('abc')
  expect(require('./attach-to-object').def).toBe('def')
  expect(require('./attach-to-object').abc).toBe('abc')
  expect(require('./attach-to-object').def).toBe('def')
})

it('should allow to attach exports to function', () => {
  expect(require('./attach-to-function')()).toBe('abc')
  expect(require('./attach-to-function').def).toBe('def')
  expect(require('./attach-to-function')()).toBe('abc')
  expect(require('./attach-to-function').def).toBe('def')
})

it('should allow to attach exports to arrow function', () => {
  expect(require('./attach-to-arrow-function')()).toBe('abc')
  expect(require('./attach-to-arrow-function').def).toBe('def')
  expect(require('./attach-to-arrow-function')()).toBe('abc')
  expect(require('./attach-to-arrow-function').def).toBe('def')
})

it('should properly handle export / require `default`', () => {
  expect(require('./require-default').moduleExportsDefault).toBe('hello')
  expect(require('./require-default').hello1).toBe('hello')
  expect(require('./require-default').hello2).toBe('hello')
  expect(require('./require-default').hello3).toBe('hello')
  expect(require('./require-default').hello4).toBe('hello')
  expect(require('./require-default').hello5).toBe('hello')
  expect(require('./require-default').hello6).toBe('hello')
  expect(require('./require-default').hello7).toBe('hello')
  expect(require('./require-default').hello8).toBe('hello')
})
