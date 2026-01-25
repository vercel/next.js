import './module'
import f, { ns } from './root2'
import * as r2 from './root2'

it('should be able to import a secondary root', () => {
  expect(f()).toBe('ok')
  expect(f.x()).toBe('ok')
  expect(ns.f()).toBe('ok')
  expect(ns.f.x()).toBe('ok')
  expect(r2.ns.f()).toBe('ok')
  expect(r2.ns.f.x()).toBe('ok')
  return import('./chunk')
})
