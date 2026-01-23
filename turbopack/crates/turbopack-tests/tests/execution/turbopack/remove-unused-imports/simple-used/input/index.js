import { value } from './module'

it('should keep module when export is used', () => {
  expect(value).toBe('value')
  expect(globalThis.moduleBundled).toBe(true)
})
