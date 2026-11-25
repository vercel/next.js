import { log } from './log.js'
// prettier-ignore
import defer * as tla from './tla.js'
// prettier-ignore
import defer * as syncWithAsyncDep from './sync-with-async-dep.js'
// prettier-ignore
import defer * as sync from './sync.js'

it('should evaluate a deferred module with top-level await eagerly', () => {
  expect(log).toContain('tla')
  expect(tla.value).toBe('tla')
})

it('should evaluate a sync module with async dependencies eagerly (accepted deviation from the proposal)', () => {
  // The proposal only evaluates the async dependencies eagerly and keeps the
  // sync module deferred. Turbopack evaluates the whole async module eagerly.
  expect(log).toContain('async-dep')
  expect(log).toContain('sync-with-async-dep')
  expect(syncWithAsyncDep.value).toBe('sync-async-dep')
})

it('should still defer sync modules in an async importer', () => {
  expect(log).not.toContain('sync')
  expect(sync.value).toBe('sync')
  expect(log).toContain('sync')
})

it('should evaluate async modules during import.defer()', async () => {
  // prettier-ignore
  const ns = await import.defer('./tla-dynamic.js')
  expect(log).toContain('tla-dynamic')
  expect(ns.value).toBe('tla-dynamic')
})
