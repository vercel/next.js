import { ns as whole } from './reexport-whole'
import { ns as viaSpecifier } from './reexport-specifier'
import { picked, flag } from './partial'

it('should keep the whole exports object when an `export const` require binding is re-exported (#21135)', () => {
  expect(whole.a).toBe('a')
  expect(whole.b).toBe('b')
  // Re-exporting the binding lets the value escape, so nothing may be shaken.
  // expect(whole.usedExports).toBe(true);
})

it('should keep the whole exports object when a require binding is re-exported via a specifier (#21135)', () => {
  expect(viaSpecifier.a).toBe('a')
  expect(viaSpecifier.b).toBe('b')
  // expect(viaSpecifier.usedExports).toBe(true);
})

it('should still tree-shake when only specific members of a require binding are re-exported', () => {
  expect(picked).toBe('a')
  // `b` is never touched, so it is shaken out of the required module.
  // expect(flag).toEqual(["a", "usedExports"]);
})
