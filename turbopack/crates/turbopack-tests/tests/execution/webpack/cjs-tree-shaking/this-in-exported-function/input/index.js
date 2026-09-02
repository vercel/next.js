it('should keep all exports when an exported function uses this (#21178)', () => {
  const signUtils = require('./module')
  expect(signUtils.buildCanonicalString('/bucket')).toBe('resource:/bucket')
  // `this` may reach any export, so nothing may be shaken.
  // expect(signUtils.usedExports).toBe(true);
})

it('should keep all exports when a module.exports member function uses this', () => {
  const m = require('./module-module-exports')
  expect(m.a()).toBe('b')
  // expect(m.usedExports).toBe(true);
})

it('should keep all exports when a top-level this member function uses this', () => {
  const m = require('./module-top-this')
  expect(m.a()).toBe('b')
  // expect(m.usedExports).toBe(true);
})

it('should keep all exports when this is captured by a nested arrow function', () => {
  const m = require('./module-arrow')
  expect(m.a()).toBe('b')
  // expect(m.usedExports).toBe(true);
})

it('should keep all exports when a defineProperty export descriptor uses this', () => {
  const m = require('./module-define')
  expect(m.a()).toBe('b')
  expect(m.c).toBe('b')
  m.d = '!'
  expect(m.received).toBe('b!')
  // expect(m.usedExports).toBe(true);
})

it('should detect this in generator, async, default-param and computed accesses', async () => {
  const m = require('./module-misc')
  expect(m.viaGenerator().next().value).toBe('h')
  expect(await m.viaAsync()).toBe('h')
  expect(m.viaDefaultParam()).toBe('h')
  expect(m.viaComputed()).toBe('h')
  // expect(m.usedExports).toBe(true);
})

it('should keep all exports when the consumer is an ESM module', () => {
  const { result } = require('./esm')
  expect(result).toBe('resource:/esm')
})

it('should still tree-shake when this only appears in nested functions', () => {
  const m = require('./module-inner')
  expect(m.a()).toBe(2)
  // expect(m.usedExports).toEqual(["a", "usedExports"]);
})

it('should still tree-shake when this is used in an exported class', () => {
  const m = require('./module-class')
  expect(new m.Impl().x).toBe('x')
  // expect(m.usedExports).toEqual(["Impl", "usedExports"]);
})

it('should still tree-shake when the exported values contain no this', () => {
  const m = require('./module-no-this')
  expect(m.a()).toBe('function')
  // expect(m.usedExports).toEqual(["a", "usedExports"]);
})
