const assert = require('node:assert/strict')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, dirname, basename, resolve } = require('node:path')
const { SourceTextModule, SyntheticModule } = require('node:vm')
const mode = process.argv[2]

async function nodeBranch() {
  const {
    createAttemptUtilities,
  } = require('next/dist/experimental/testing/assertions/utilities')
  const name = 'NEXT_ENV_COMPONENT_ORIGINAL'
  const original = process.env[name]
  process.env[name] = 'node-original'
  let active = true
  const inactive = new Error('inactive env utility')
  const utility = createAttemptUtilities(() => {
    if (!active) throw inactive
  })
  try {
    assert.equal(utility.stubEnv(name, true), utility)
    assert.equal(process.env[name], 'true')
    utility.stubEnv(name, 'second')
    utility.stubEnv(name, undefined)
    assert.equal(Object.hasOwn(process.env, name), false)
    assert.equal(utility.unstubAllEnvs(), utility)
    assert.equal(process.env[name], 'node-original')
    utility.stubEnv(name, 'dispose-restores')
    active = false
    assert.throws(
      () => utility.stubEnv(name, 'late'),
      (error) => error === inactive
    )
    utility.dispose()
    assert.equal(process.env[name], 'node-original')
  } finally {
    utility.dispose()
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      originalNodeStringConversion: true,
      restored: true,
    }) + '\n'
  )
}

async function browserBranch() {
  const commonPrimitive = require.resolve(
    'next/dist/compiled/next-test-primitives'
  )
  const browserPrimitive = require('next/dist/compiled/next-test-primitives/browser')
  assert.equal(typeof browserPrimitive.createTimerContext, 'function')
  require.cache[commonPrimitive] = {
    id: commonPrimitive,
    filename: commonPrimitive,
    loaded: true,
    exports: browserPrimitive,
  }
  const clockModule = require.resolve(
    'next/dist/experimental/testing/assertions/fake-timers'
  )
  require.cache[clockModule] = {
    id: clockModule,
    filename: clockModule,
    loaded: true,
    exports: require('next/dist/experimental/testing/client/fake-timers'),
  }
  const client = require('next/dist/experimental/testing/client/async-context')
  const platform = require.resolve(
    'next/dist/experimental/testing/assertions/assertion-platform'
  )
  assert.equal(require(platform).fileAssertionLifetime, false)
  const browserPlatform = require('next/dist/experimental/testing/client/assertion-platform')
  assert.equal(browserPlatform.fileAssertionLifetime, true)
  require.cache[platform] = {
    ...require.cache[platform],
    exports: browserPlatform,
  }
  const snapshotModule = require.resolve(
    'next/dist/experimental/testing/assertions/snapshot-environment'
  )
  const browserSnapshots = require('next/dist/experimental/testing/client/snapshot-environment')
  require.cache[snapshotModule] = {
    id: snapshotModule,
    filename: snapshotModule,
    loaded: true,
    exports: browserSnapshots,
  }
  browserSnapshots.installBrowserSnapshotBridge({
    async request(method, args) {
      if (method === 'resolvePath')
        return join(
          dirname(args[0]),
          '__snapshots__',
          basename(args[0]) + '.snap'
        )
      if (method === 'resolveRawPath') return resolve(dirname(args[0]), args[1])
      if (method === 'readSnapshotFile') {
        try {
          return await readFile(args[0], 'utf8')
        } catch (error) {
          if (error.code === 'ENOENT') return null
          throw error
        }
      }
      throw new Error('Unexpected snapshot request ' + method)
    },
    // No subject uses snapshots; actual source-map behavior is outside this clock component.
    mapLocation: (frame) => frame,
  })
  const {
    createAssertionRuntime,
  } = require('next/dist/experimental/testing/assertions')

  // A private exports facade selects this component's genuine Browser assertion
  // runtime. Unused runner exports retain their original function identities.
  let runtime
  const runnerModule = require.resolve('next/dist/experimental/testing/runner')
  const originalRunner = require(runnerModule)
  const activeRuntime = () => {
    browserPlatform.assertAssertionRuntimeAccess()
    assert.ok(runtime)
    return runtime
  }
  require.cache[runnerModule] = {
    ...require.cache[runnerModule],
    exports: {
      ...originalRunner,
      getAssertionRuntime: activeRuntime,
      getAssertionRuntimeForAssertions: activeRuntime,
    },
  }
  const browser = require('next/dist/experimental/testing/client/vitest')
  let serial = 0

  const env = require('next/dist/experimental/testing/client/env')
  const expected = require('./browser-env-stubs-pristine.json')
  const directory = await mkdtemp(join(tmpdir(), 'next-browser-env-stubs-'))
  const scopes = [],
    definitions = [],
    hooks = [],
    rows = [],
    completed = [],
    late = []
  const originalLog = console.log
  let collectionHandle, activeHandle, collection, active
  const scope = (kind, name) => {
    const context = {
      id: 'env-' + ++serial,
      name,
      ...(kind === 'attempt'
        ? { testId: name }
        : kind === 'hook'
          ? { hook: 'afterAll' }
          : {}),
    }
    const boundary = client.createAsyncScope({ kind, context }, (error) =>
      late.push(error)
    )
    const token = boundary.run(() => client.captureCreatorScope())
    const owner = { context, boundary, token }
    scopes.push(owner)
    return owner
  }
  const frame = async (owner, callback) => {
    const leave = client.enterCreatorScope(owner.token)
    try {
      return await owner.boundary.run(callback)
    } finally {
      leave()
    }
  }
  const finish = async (owner, handle) => {
    await frame(owner, async () => {
      if (owner.context.testId) await handle.finishTest(false)
      await handle.finalize()
      await handle.dispose()
    })
    owner.boundary.close()
  }
  try {
    console.log = (...args) => {
      assert.equal(typeof args[0], 'string')
      assert.ok(args[0].startsWith('BROWSER_ENV_STUBS_RAW '))
      rows.push(JSON.parse(args[0].slice('BROWSER_ENV_STUBS_RAW '.length)))
    }
    // Literal authored reference config. Native defaults here are host inputs;
    // actual ModuleAssetContext/codegen and Chromium proofs remain separate.
    env.configureBrowserEnv({
      NEXT_ENV_RECON_EXISTING: 'configured-value',
      NEXT_ENV_RECON_DELETED: 'configured-delete',
    })
    const defaults = {
      DEV: true,
      PROD: false,
      SSR: false,
      MODE: 'development',
      BASE_URL: '/',
    }
    const firstEnv = env.getBrowserEnv(defaults)
    assert.equal(
      env.getBrowserEnv({ ...defaults, DEV: false, SSR: true }),
      firstEnv
    )
    assert.equal(firstEnv.DEV, true)
    collection = scope('collection', 'env-file')
    runtime = await collection.boundary.run(() =>
      createAssertionRuntime({
        testPath: join(directory, 'env-stubs.test.mjs'),
        resourceLifetime: 'file',
        unstubEnvs: true,
        getCurrentAttempt: client.getOriginatingAttempt,
        getCurrentHook: client.getOriginatingHook,
        getCurrentCollection: client.getOriginatingCollection,
        getCurrentScopeAncestors: client.getOriginatingScopeAncestors,
      })
    )
    collectionHandle = collection.boundary.run(() =>
      runtime.beginCollection(collection.context)
    )
    const initializeImportMeta = (meta) => {
      meta.env = env.getBrowserEnv(defaults)
    }
    const api = new SyntheticModule(
      ['afterAll', 'expect', 'test', 'vi'],
      function () {
        this.setExport('afterAll', (body) => hooks.push(body))
        this.setExport('expect', browser.expect)
        this.setExport('test', (name, body) => definitions.push({ name, body }))
        this.setExport('vi', browser.vi)
      }
    )
    const helper = new SourceTextModule(
      await readFile(
        join(__dirname, 'browser-env-stubs-fixtures/env-helper.mjs.txt'),
        'utf8'
      ),
      { initializeImportMeta }
    )
    const subject = new SourceTextModule(
      await readFile(
        join(__dirname, 'browser-env-stubs-fixtures/env-stubs.test.mjs.txt'),
        'utf8'
      ),
      { initializeImportMeta }
    )
    let retained
    await frame(collection, async () => {
      retained = browser.vi.stubEnv
      assert.equal(retained, browser.vi.stubEnv)
      assert.equal(typeof browser.vi.unstubAllEnvs, 'function')
      await subject.link((specifier) => {
        if (specifier === 'vitest') return api
        if (specifier === './env-helper.mjs') return helper
        throw new Error('Unexpected literal fixture import ' + specifier)
      })
      await subject.evaluate()
    })
    await finish(collection, collectionHandle)
    collectionHandle = undefined
    for (const definition of definitions) {
      active = scope('attempt', definition.name)
      activeHandle = active.boundary.run(() =>
        runtime.beginAttempt(active.context)
      )
      await frame(active, definition.body)
      await finish(active, activeHandle)
      activeHandle = undefined
      completed.push(definition.name)
    }
    active = scope('hook', 'afterAll')
    activeHandle = active.boundary.run(() => runtime.beginHook(active.context))
    await frame(active, async () => {
      for (const body of hooks) await body()
    })
    await finish(active, activeHandle)
    activeHandle = undefined
    process.stdout.write(
      JSON.stringify({ phase: 'observed', mode, rows, completed }) + '\n'
    )
    assert.deepEqual(
      completed,
      expected.cases.map((test) => test.fullName)
    )
    assert.deepEqual(rows, expected.rows)
    assert.deepEqual(late, [])
    await runtime.finishFile()
    runtime = undefined
    assert.equal(env.getBrowserEnv(defaults), firstEnv)
    assert.throws(
      () => retained('NEXT_ENV_RECON_MISSING', 'late'),
      /Browser Mode API access requires/
    )
    assert.equal(late.length, 1)
  } finally {
    console.log = originalLog
    try {
      if (activeHandle) await finish(active, activeHandle)
      if (collectionHandle) await finish(collection, collectionHandle)
    } finally {
      try {
        await runtime?.finishFile()
      } finally {
        runtime = undefined
        for (const owner of scopes) owner.boundary.close()
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
  process.stdout.write(
    JSON.stringify({ mode, completed, rows, cleaned: true }) + '\n'
  )
}
;(mode === 'node' ? nodeBranch() : browserBranch()).catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
