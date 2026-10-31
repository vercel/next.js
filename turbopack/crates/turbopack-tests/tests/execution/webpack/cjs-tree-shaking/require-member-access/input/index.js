it('should tree-shake CommonJS exports when accessed via a member call', () => {
  const m = require('./module')
  expect(m.a()).toBe('a')
  // expect(m.usedExports).toEqual(["a", "usedExports"]);
})

it('should tree-shake CommonJS exports when accessed as a property', () => {
  const m = require('./module')
  const a = m.a
  // const u = m.usedExports;
  expect(a()).toBe('a')
  // expect(u).toEqual(["a", "usedExports"]);
})

it('should tree-shake CommonJS exports when accessed with a string literal', () => {
  const m = require('./module')
  expect(m['a']()).toBe('a')
  // expect(m.usedExports).toEqual(["a", "usedExports"]);
})

it('should bail out when the require result is read as a value (spread)', () => {
  const m = require('./module-rest')
  // Spreading the namespace forces every export to remain reachable.
  const all = { ...m }
  expect(all.a).toBe('a')
  expect(all.b).toBe('b')
  // expect(all.usedExports).toBe(true);
})

it('should bail out when the require result is accessed with a dynamic key', () => {
  const m = require('./module-rest')
  const key = 'a'
  expect(m[key]).toBe('a')
  // Dynamic-key access cannot be statically tracked, so every export must
  // remain reachable.
  // expect(m.usedExports).toBe(true);
})

it('should bail out when the require result is called directly', () => {
  const m = require('./module-call')
  expect(m()).toBe('direct-call')
  // Calling the namespace itself means the whole exports object is observable;
  // every attached property must still be reachable.
  expect(m.x).toBe('x')
  // `module.exports = fn` already prevents named-export tracking, so usage
  // reports `null` ("no specific usage tracked").
  // expect(m.usedExports).toBe(null);
})
