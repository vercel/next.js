import def, { named, __esModule } from './module'
import * as ns from './module'

it('should allow to import module with getters', () => {
  expect(def).toBe('default')
  expect(named).toBe('named')
  expect(__esModule).toBe(true)
  expect(ns.default).toBe('default')
  expect(ns.named).toBe('named')
  expect(ns.__esModule).toBe(true)
  const indirect = Object(ns)
  expect(indirect.default).toBe('default')
  expect(indirect.named).toBe('named')
  expect(indirect.__esModule).toBe(true)
})
