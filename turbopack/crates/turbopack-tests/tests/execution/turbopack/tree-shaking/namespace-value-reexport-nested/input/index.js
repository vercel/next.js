// Member narrowing follows the whole static member chain, through every namespace level.
import { nestedNamespace } from './lib'

it('should narrow through a nested namespace-valued export', () => {
  expect(nestedNamespace.locales.en).toBe('en')
  expect(nestedNamespace.locales.enUsed).toBe(true)
  expect(nestedNamespace.locales.deUsed).toBe(false)
})
