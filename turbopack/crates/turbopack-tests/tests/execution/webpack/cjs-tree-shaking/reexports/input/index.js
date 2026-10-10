it('should allow to reexport a exports object (this, exports)', () => {
  expect(require('./reexport-whole-exports').module1.abc).toBe('abc')
  expect(require('./reexport-whole-exports').module2.abc).toBe('abc')
  expect(require('./reexport-whole-exports').module3.abc).toBe('abc')
  expect(require('./reexport-whole-exports').module4.abc).toBe('abc')
})

it('should allow to reexport a exports object (module.exports, object literal)', () => {
  expect(require('./reexport-whole-module-exports').module1.abc).toBe('abc')
  expect(require('./reexport-whole-module-exports').module2.abc).toBe('abc')
  expect(require('./reexport-whole-module-exports').module3.abc).toBe('abc')
  expect(require('./reexport-whole-module-exports').module4.abc).toBe('abc')
})

it('should allow to reexport a imported property (this, exports)', () => {
  expect(require('./reexport-property-exports').property1).toBe('abc')
  expect(require('./reexport-property-exports').property2).toBe('abc')
  expect(require('./reexport-property-exports').property3).toBe('abc')
  expect(require('./reexport-property-exports').property4).toBe('abc')
})

it('should allow to reexport a imported property (module.exports, object literal)', () => {
  expect(require('./reexport-property-module-exports').property1).toBe('abc')
  expect(require('./reexport-property-module-exports').property2).toBe('abc')
  expect(require('./reexport-property-module-exports').property3).toBe('abc')
  expect(require('./reexport-property-module-exports').property4).toBe('abc')
})

it('should allow to reexport a reexported exports object (this, exports)', () => {
  expect(require('./reexport-reexport-exports').reexport1.abc).toBe('abc')
  expect(require('./reexport-reexport-exports').reexport2.abc).toBe('abc')
  expect(require('./reexport-reexport-exports').reexport3.abc).toBe('abc')
  expect(require('./reexport-reexport-exports').reexport4.abc).toBe('abc')
})

it('should allow to reexport a reexported exports object (module.exports, object literal)', () => {
  expect(require('./reexport-reexport-module-exports').reexport1.abc).toBe(
    'abc'
  )
  expect(require('./reexport-reexport-module-exports').reexport2.abc).toBe(
    'abc'
  )
  expect(require('./reexport-reexport-module-exports').reexport3.abc).toBe(
    'abc'
  )
  expect(require('./reexport-reexport-module-exports').reexport4.abc).toBe(
    'abc'
  )
})

it('should keep executing modules even when unused', () => {
  const counter = require('./counter')
  counter.value = 0
  exports.unused1 = require('./add-to-counter-1')
  exports.unused2 = require('./add-to-counter-2').abc
  expect((exports.unused3 = require('./add-to-counter-3').abc)).toBe(42)
  expect(counter.value).toBe(3)
})

it('should allow to reexport a reexported module that bails out (indirect)', () => {
  const abc = require('./reexport-indirect').module1.abc
  const bailout = Object(require('./module'))
  expect(abc).toBe(bailout.abc)
})

it('should allow to reexport a reexported module that bails out (direct)', () => {
  const abc = require('./reexport-direct').abc
  const bailout = Object(require('./module'))
  expect(abc).toBe(bailout.abc)
})
