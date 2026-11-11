// Controlled real-worker activation fixture; the kernel map is explicitly synthetic.
const assert = require('node:assert/strict')
const { appendFileSync } = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
const runtime = require(paths.mocking)
const cache = require(paths.moduleCache)
const facade = require(paths.vitest)
const { createModuleImportTracker } = require(paths.imports)
const trace = (value) => appendFileSync(paths.trace, value + '\n')
trace('bootstrap')
const context = Object.assign(Object.create({}), {
  c: new Map([
    ['subject', { exports: {} }],
    ['bootstrap', { exports: {} }],
  ]),
  M: new Map([
    ['subject', () => {}],
    ['bootstrap', () => {}],
  ]),
  m: { id: 'bootstrap' },
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
exports.mockTesting = {
  ...runtime,
  initializeModuleMocking(options) {
    trace('mock-initialize')
    const binding = runtime.initializeModuleMocking(options)
    return {
      dispose() {
        trace('mock-dispose')
        binding.dispose()
      },
    }
  },
}
exports.loadTestModule = async () => {
  trace('collect')
  let factoryCalls = 0
  runtime.registerModuleMock(
    'worker-original-require-reset',
    () => {
      factoryCalls++
      return { value: 'mock' }
    },
    async () => ({ value: 'original' })
  )
  const before = await runtime.resolveModuleMock(
    'worker-original-require-reset',
    ['value']
  )
  facade.test('the registry is active before the registration loads', () => {
    trace('mock-case')
    assert.deepEqual(before, { value: 'mock' })
  })
  facade.test(
    'the public reset preserves the active factory cache',
    async () => {
      trace('reset-case')
      assert.equal(facade.vi.resetModules(), facade.vi)
      assert.equal(context.c.has('subject'), false)
      assert.equal(context.c.has('bootstrap'), true)
      assert.equal(
        await runtime.resolveModuleMock('worker-original-require-reset', [
          'value',
        ]),
        before
      )
      assert.equal(factoryCalls, 1)
    }
  )
}
