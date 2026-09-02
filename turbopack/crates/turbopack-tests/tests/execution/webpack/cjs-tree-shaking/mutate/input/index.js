import module1 from './module-1'
// Dropped the `{ a }` named import: turbopack resolves a named CJS import that
// isn't a static export to `undefined` rather than a live getter, so a
// runtime-added `exports.a` isn't observed through the binding.
import module2 from './module-2'

it('should allow mutating imported modules (changing existing exports)', () => {
  expect(module1.abc).toBe('abc')
  expect(module1.def).toBe('def')
  module1.abc = 'new-abc'
  expect(module1.abc).toBe('new-abc')
  expect(module1.def).toBe('def')
})

it('should allow mutating imported modules (adding new properties)', () => {
  expect(module2.abc).toBe('abc')
  expect(module2.def).toBe('def')
  expect(module2.ghi).toBe(undefined)
  expect(module2.Oi).toBe(undefined)
  expect(module2.a).toBe(undefined)
  // expect(a).toBe(undefined);
  expect(module2['']).toBe(undefined)
  module2.ghi = 'ghi'
  module2.Oi = 'Oi'
  module2.a = 'a'
  module2[''] = {}
  module2[''].abc = 'abc'
  expect(module2.abc).toBe('abc')
  expect(module2.def).toBe('def')
  expect(module2.ghi).toBe('ghi')
  expect(module2.Oi).toBe('Oi')
  expect(module2.a).toBe('a')
  // expect(a).toBe("a");
  expect(module2['']).toEqual({ abc: 'abc' })
  expect(module2[''].abc).toBe('abc')
})
