import { l } from './left'
import { r } from './right'

it('should transitively remove unused re-export chains', () => {
  expect(l).toBe('l')
  expect(r).toBe('r')
  expect(globalThis.depBundled).toBeUndefined()
})
