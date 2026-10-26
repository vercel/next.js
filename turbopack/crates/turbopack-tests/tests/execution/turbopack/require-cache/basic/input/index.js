// `require.cache` is exposed through the `@turbopack/module-cache` helper,
// which wraps the runtime's `Map` in a `Proxy` with object semantics.

it('should read entries with bracket access', () => {
  const dep = require('./dep')
  const id = require.resolve('./dep')

  const entry = require.cache[id]
  expect(entry).toBeDefined()
  expect(entry.exports).toBe(dep)
})

it('should report membership with `in` and hasOwnProperty', () => {
  require('./other')
  const id = require.resolve('./other')

  expect(id in require.cache).toBe(true)
  expect(Object.prototype.hasOwnProperty.call(require.cache, id)).toBe(true)
  expect('./definitely-not-a-module' in require.cache).toBe(false)
  expect(require.cache['./definitely-not-a-module']).toBeUndefined()
})

it('should enumerate entries', () => {
  require('./dep')
  require('./other')
  const depId = require.resolve('./dep')
  const otherId = require.resolve('./other')

  // Keys always come back as strings, even when module ids are numbers.
  const keys = Object.keys(require.cache)
  expect(keys).toContain(String(depId))
  expect(keys).toContain(String(otherId))

  // Object.values / entries / spread / for-in all go through the same
  // ownKeys + getOwnPropertyDescriptor trap pair.
  expect(Object.values(require.cache).length).toBe(keys.length)
  expect(Object.entries(require.cache).length).toBe(keys.length)
  expect(Object.keys({ ...require.cache }).length).toBe(keys.length)

  const seen = []
  for (const key in require.cache) {
    seen.push(key)
  }
  expect(seen).toContain(String(depId))
})

it('should re-evaluate a module after its entry is deleted', () => {
  const id = require.resolve('./dep')

  // Earlier tests may already have instantiated `./dep`; start from a known
  // state so the eval counter reflects only this test.
  delete require.cache[id]
  globalThis.depEvalCount = 0

  require('./dep')
  expect(globalThis.depEvalCount).toBe(1)

  // Cached: not re-evaluated.
  require('./dep')
  expect(globalThis.depEvalCount).toBe(1)

  delete require.cache[id]
  expect(id in require.cache).toBe(false)

  require('./dep')
  expect(globalThis.depEvalCount).toBe(2)
})

it('should re-evaluate a module after its entry is assigned undefined', () => {
  const id = require.resolve('./dep')

  delete require.cache[id]
  globalThis.depEvalCount = 0

  require('./dep')
  expect(globalThis.depEvalCount).toBe(1)

  // Node keeps the key present but falsy; the runtime treats it as a miss.
  require.cache[id] = undefined
  expect(require.cache[id]).toBeUndefined()

  require('./dep')
  expect(globalThis.depEvalCount).toBe(2)
})

it('should keep a written entry reachable by require()', () => {
  // A write has to store the key under the id type the runtime looks up with,
  // not the string the Proxy trap received. Otherwise the entry is stranded:
  // visible via `Object.keys`, but never found by `require()`.
  //
  // Re-insert the runtime's own module object rather than a hand-made one, so
  // this exercises the key type without depending on a module's internal shape.
  const id = require.resolve('./other')

  require('./other')
  const entry = require.cache[id]
  expect(entry).toBeDefined()

  delete require.cache[id]
  expect(id in require.cache).toBe(false)

  require.cache[id] = entry

  expect(require.cache[id]).toBe(entry)
  // The real proof: the runtime finds the re-inserted entry and returns its
  // exports instead of re-instantiating the module.
  expect(require('./other')).toBe(entry.exports)
})
