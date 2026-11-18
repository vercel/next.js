import { lib } from './module'

it('keeps the side effects of the module', () => {
  // The order of the side effects relative to the `dog += '!'` updates is
  // currently not preserved with module fragments, see the
  // `__skipped__/side-effect-order` test.
  expect(globalThis.dogLogs).toHaveLength(3)
})

it('keeps all exports working', () => {
  expect(lib.cat).toBe('cat')
  expect(lib.initialCat).toBe('cat')
  expect(lib.dogRef.initial).toBe('dog!!!')
  expect(lib.getChimera()).toBe('catdog!!!')
  lib.dogRef.set('wolf')
  expect(lib.dogRef.get()).toBe('wolf')
  expect(lib.getChimera()).toBe('catwolf')
})
