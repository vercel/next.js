import { log } from './log.js'
import * as eager from './eager-target.js'
// prettier-ignore
import defer * as staticNs from './target.js'
// prettier-ignore
import defer * as cjsNs from './cjs.cjs'
// prettier-ignore
import defer * as asyncNs from './async-target.js'
import { otherNs, otherCjsNs } from './other-importer.js'
import { ns as reexportedNs } from './reexporter.js'
// prettier-ignore
import defer * as eagerDeferred from './eager-target.js'

it('should return the same namespace for repeated import.defer() calls', async () => {
  // prettier-ignore
  const a = await import.defer('./target.js')
  // prettier-ignore
  const b = await import.defer('./target.js')
  expect(a).toBe(b)
  expect(log).not.toContain('target')
})

it('should share the namespace between static importers and import.defer()', async () => {
  expect(staticNs).toBe(otherNs)
  // prettier-ignore
  expect(await import.defer('./target.js')).toBe(staticNs)
  expect(reexportedNs).toBe(staticNs)
  expect(log).not.toContain('target')
  expect(staticNs.value).toBe('target-value')
  expect(log).toContain('target')
})

it('should share Proxy namespaces of CommonJS modules', async () => {
  expect(cjsNs).toBe(otherCjsNs)
  // prettier-ignore
  expect(await import.defer('./cjs.cjs')).toBe(cjsNs)
})

it('should return a deferred namespace for async modules', async () => {
  // prettier-ignore
  const dynamicNs = await import.defer('./async-target.js')
  expect(dynamicNs).toBe(asyncNs)
  expect(dynamicNs).not.toBe(await import('./async-target.js'))
  expect(asyncNs.value).toBe('async-value')
})

it('should create a deferred namespace distinct from the ordinary namespace', async () => {
  expect(eagerDeferred).not.toBe(eager)
  expect(eagerDeferred.value).toBe('eager-value')
  expect(Object.prototype.toString.call(eagerDeferred)).toBe(
    '[object Deferred Module]'
  )
  // prettier-ignore
  expect(await import.defer('./eager-target.js')).toBe(eagerDeferred)
})
