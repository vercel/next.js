import { log } from './log.js'
// prettier-ignore
import defer * as barrel from './side-effect-free/barrel.js'
// prettier-ignore
import defer * as mixed from './mixed.js'
import './eager-importer.js'
// prettier-ignore
import defer * as sameImporter from './same-importer.js'
import { same } from './same-importer.js'

it('should preserve deferral through side-effect-free re-exports', () => {
  expect(log).not.toContain('inner')
  expect(log).not.toContain('other')
  expect(barrel.inner).toBe('inner')
  expect(log).toContain('inner')
  expect(barrel.ownValue).toBe('own')
})

it('should evaluate a deferred module when it is also imported eagerly elsewhere', () => {
  expect(log).toContain('mixed')
  expect(log.indexOf('mixed')).toBeLessThan(log.indexOf('eager-importer:mixed'))
  expect(mixed.mixed).toBe('mixed')
})

it('should evaluate a module eagerly when the same importer also imports it eagerly', () => {
  expect(log).toContain('same-importer')
  expect(same).toBe('same')
  expect(sameImporter.same).toBe('same')
})
