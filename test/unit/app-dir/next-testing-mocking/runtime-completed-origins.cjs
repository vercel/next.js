const assert = require('node:assert/strict')
const { join } = require('node:path')
const { promiseHooks } = require('node:v8')
const base =
  process.argv[2] ||
  require('node:path').dirname(
    require.resolve('next/dist/experimental/testing/vitest')
  )
const dynamic = require(join(base, 'mocking/dynamic'))
const cache = require(join(base, 'mocking/module-cache'))
const scopes = require(join(base, 'runner/async-context'))
const promiseOrigins = new WeakMap()
const stop = promiseHooks.onInit((promise) => {
  promiseOrigins.set(promise, scopes.peekOriginatingScope()?.context.id ?? null)
})
const late = []
const first = scopes.createAsyncScope(
  {
    kind: 'attempt',
    context: {
      id: 'factory-A',
      testId: 'A',
      name: 'factory A',
      signal: new AbortController().signal,
    },
  },
  (error) => late.push(error)
)
const second = scopes.createAsyncScope(
  {
    kind: 'attempt',
    context: {
      id: 'caller-B',
      testId: 'B',
      name: 'caller B',
      signal: new AbortController().signal,
    },
  },
  (error) => late.push(error)
)
const actual = { original: true }
const loaded = []
const prototype = {
  i(id) {
    loaded.push({
      id,
      scope: scopes.peekOriginatingScope()?.context.id ?? null,
      closed: scopes.peekOriginatingScope()?.closed ?? false,
    })
    return actual
  },
  A(id) {
    return this.r(id)(this.i.bind(this))
  },
  r(id) {
    return (load) => Promise.resolve().then(() => load(id - 10))
  },
}
const records = new Map([[1, { id: 1, exports: {} }]])
const context = Object.assign(Object.create(prototype), {
  m: { id: 0 },
  c: records,
  M: new Map([
    [1, () => {}],
    [2, () => {}],
  ]),
})
const owner = cache.initializeModuleCache(
  context,
  { version: 1, resettable: [1, 2], protected: [] },
  () => {}
)
const binding = dynamic.initializeDynamicModuleMocking(
  context,
  { version: 1, owners: [1], targets: [{ id: 2, requests: ['./target'] }] },
  {
    trackImport() {},
    onLateFailure(error) {
      late.push(error)
    },
  }
)
const importer = Object.assign(Object.create(prototype), {
  m: records.get(1),
  c: records,
  M: context.M,
})
async function main() {
  let retained
  first.run(() =>
    dynamic.doMock('./target', (original) => {
      retained = original
      return { mocked: true }
    })
  )
  assert.deepEqual(await first.run(() => importer.A(12)), { mocked: true })
  first.close({ compilerContinuations: true })
  const returned = second.run(() => retained())
  assert.equal(await returned, actual)
  const factory = {
    callbackPromiseScope: promiseOrigins.get(returned),
    loaderScope: loaded.at(-1).scope,
    loaderClosed: loaded.at(-1).closed,
    ordinaryCallback: retained.constructor === Function,
    arguments: retained.length,
  }
  second.run(() => dynamic.doUnmock('./target'))
  const caller = second.run(() => importer.A(12))
  assert.equal(await caller, actual)
  const publicCaller = {
    publicPromiseScope: promiseOrigins.get(caller),
    loaderScope: loaded.at(-1).scope,
  }
  assert.deepEqual(late, [])
  binding.dispose()
  owner.dispose()
  first.close()
  second.close()
  stop()
  console.log(
    JSON.stringify({
      factory,
      publicCaller,
      exactNamespace: true,
      lateErrors: 0,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
