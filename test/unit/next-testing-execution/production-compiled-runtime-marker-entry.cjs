// Controlled real-worker activation fixture; the kernel and loader are synthetic.
const assert = require('node:assert/strict')
const { appendFileSync } = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
const dynamic = require(paths.dynamic)
const cache = require(paths.moduleCache)
const facade = require(paths.vitest)
const { createModuleImportTracker } = require(paths.imports)
const trace = (value) => appendFileSync(paths.trace, value + '\n')
trace('bootstrap')
const subject = { id: 'subject', exports: { value: 'original' } }
const bootstrap = { id: 'bootstrap', exports: {} }
const prototype = {
  i(id) {
    return this.c.get(id).exports
  },
  A(id) {
    return this.r(id)(this.i.bind(this))
  },
  r(id) {
    assert.equal(id, 'loader')
    return (importModule) =>
      Promise.resolve().then(() => importModule('subject'))
  },
}
const context = Object.assign(Object.create(prototype), {
  c: new Map([
    ['subject', subject],
    ['bootstrap', bootstrap],
  ]),
  M: new Map([
    ['subject', () => {}],
    ['bootstrap', () => {}],
  ]),
  m: bootstrap,
})
exports.testRunner = runner
exports.initializeModuleImportTracking = () => {
  const binding = createModuleImportTracker(context)
  return {
    ...binding,
    dispose() {
      trace('imports-dispose')
      binding.dispose()
    },
  }
}
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
exports.initializeDynamicModuleMocking = (options) => {
  trace('dynamic-initialize')
  const binding = dynamic.initializeDynamicModuleMocking(
    context,
    {
      version: 1,
      owners: ['bootstrap'],
      targets: [{ id: 'subject', requests: ['./subject.cjs'] }],
    },
    options
  )
  return {
    dispose() {
      trace('dynamic-dispose')
      binding.dispose()
    },
  }
}
exports.loadTestModule = async () => {
  trace('collect')
  let factoryCalls = 0
  let first
  facade.test(
    'the runtime registry is active before the first import',
    async () => {
      trace('mock-case')
      facade.vi.doMock('./subject.cjs', () => {
        factoryCalls++
        return { value: 'mock' }
      })
      first = await context.A('loader')
      assert.equal(first.value, 'mock')
      assert.equal(await context.A('loader'), first)
    }
  )
  facade.test(
    'the public reset retains the actual runtime factory cache',
    async () => {
      trace('reset-case')
      assert.equal(facade.vi.resetModules(), facade.vi)
      assert.equal(context.c.has('subject'), false)
      assert.equal(context.c.has('bootstrap'), true)
      assert.equal(typeof context.M.get('subject'), 'function')
      assert.equal(await context.A('loader'), first)
      assert.equal(factoryCalls, 1)
    }
  )
}
