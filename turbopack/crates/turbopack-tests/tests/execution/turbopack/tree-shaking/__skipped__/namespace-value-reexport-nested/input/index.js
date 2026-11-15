// Runtime behavior is covered by the enabled `namespace-value-reexport` fixtures. This remains
// skipped only because member narrowing currently stops at the first namespace level.
import { nestedNamespace } from './lib'

it('should narrow through a nested namespace-valued export', () => {
  expect(nestedNamespace.locales.en).toBe('en')
  expect(nestedNamespace.locales.enUsed).toBe(true)
  expect(nestedNamespace.locales.deUsed).toBe(false)
})
