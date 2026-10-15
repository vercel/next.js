// Controlled bootstrap for real host ordering, not a compiled module graph.
const assert = require('node:assert/strict')
const { appendFileSync } = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
const cache = require(paths.moduleCache)
const { createModuleImportTracker } = require(paths.imports)
const facade = require(paths.vitest)
const trace = (value) => appendFileSync(paths.trace, value + '\n')
trace('bootstrap')
const context = Object.assign(Object.create({}), {
  c: new Map([
    ['subject', { exports: { value: 1 } }],
    ['bootstrap', { exports: {} }],
  ]),
  M: new Map([
    ['subject', () => {}],
    ['bootstrap', () => {}],
  ]),
  m: { id: 'bootstrap' },
})
exports.testRunner = runner
if (paths.tracker)
  exports.initializeModuleImportTracking = () => {
    const binding = createModuleImportTracker(context)
    return {
      ...binding,
      dispose() {
        assert.throws(
          () => cache.resetModules(),
          /active compiler-owned module cache/
        )
        trace('imports-dispose')
        binding.dispose()
      },
    }
  }
if (paths.expose)
  exports.initializeModuleCache = (retire) => {
    trace('cache-initialize')
    const binding = cache.initializeModuleCache(
      context,
      { version: 1, resettable: ['subject'], protected: [] },
      retire
    )
    return {
      dispose() {
        trace('cache-dispose')
        binding.dispose()
      },
    }
  }
exports.loadTestModule = async () => {
  trace('collect')
  facade.test('public reset uses the compiler-owned cache', () => {
    trace('case')
    if (paths.marked) {
      assert.equal(facade.vi.resetModules(), facade.vi)
      assert.equal(context.c.has('subject'), false)
      assert.equal(context.c.has('bootstrap'), true)
    } else
      assert.throws(
        () => facade.vi.resetModules(),
        /active compiler-owned module cache/
      )
  })
}
