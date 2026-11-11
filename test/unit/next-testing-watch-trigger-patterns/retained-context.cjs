const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  cp = require('node:child_process'),
  crypto = require('node:crypto'),
  { createRequire } = require('node:module')
const repo = path.resolve(__dirname, '../../..'),
  next = process.argv[2] || path.join(repo, 'packages/next'),
  product = createRequire(path.join(next, 'package.json')),
  directory = path.dirname(
    product.resolve('next/dist/experimental/testing/config')
  ),
  inputs = path.join(__dirname, 'fixtures/retained-trigger-context'),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const files = [
  'config.js',
  'config-modules.js',
  'config-worker.js',
  'config-loader.js',
  'compiler/config-import-loader.js',
  'execution/process.js',
  'runner/collector.js',
  'runner/sequence.js',
  'compiler/transform-broker.js',
  'reporting/options.js',
  'coverage/options.js',
  'coverage/custom-options.js',
  'coverage/provider-override.js',
  'environments/config.js',
  'scheduling.js',
  'browser-instances.js',
  'typecheck.js',
]
const pins = () =>
    Object.fromEntries(
      files.map((name) => {
        const file = path.join(directory, name)
        return [file, sha(fs.readFileSync(file))]
      })
    ),
  before = pins()
const hadTrace = Object.hasOwn(process.env, 'NEXT_TEST_TRIGGER_SETUP_TRACE'),
  priorTrace = process.env.NEXT_TEST_TRIGGER_SETUP_TRACE
const originalFork = cp.fork
const children = [],
  requests = []
cp.fork = function (...args) {
  const child = Reflect.apply(originalFork, this, args)
  children.push(child)
  const send = child.send
  child.send = function (...args) {
    if (typeof args[0]?.type === 'string')
      requests.push({ pid: child.pid, type: args[0].type })
    return Reflect.apply(send, this, args)
  }
  return child
}
const { openTestConfiguration } = product(
  'next/dist/experimental/testing/config'
)
const scenarios = []
const base = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'next-retained-trigger-context-'))
)
async function scenario(name, global, run) {
  const dir = base + '/' + name
  fs.mkdirSync(dir)
  fs.writeFileSync(dir + '/package.json', '{"private":true,"type":"module"}\n')
  fs.copyFileSync(
    inputs +
      '/' +
      (global ? 'global.config.mjs.txt' : 'context.config.mjs.txt'),
    dir + '/vitest.config.mjs'
  )
  fs.writeFileSync(dir + '/payload.mjs', 'export const value=1\n')
  fs.copyFileSync(inputs + '/global.mjs.txt', dir + '/global.mjs')
  process.env.NEXT_TEST_TRIGGER_SETUP_TRACE = dir + '/global.log'
  const control = new AbortController(),
    lifetime = new AbortController(),
    start = requests.length
  let configuration
  try {
    configuration = await openTestConfiguration(dir, control.signal)
    assert.equal(configuration.hasWatchTriggers, true)
    assert.equal(
      await configuration.retainWatchTriggersForWatch(lifetime.signal, true),
      true
    )
    const result = await run({
      dir,
      configuration,
      lifetime,
      select: () =>
        configuration.config.projects.map((project) => ({ ...project })),
    })
    scenarios.push({ name, ...result, requests: requests.slice(start) })
  } finally {
    if (configuration) await configuration.dispose()
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null)
        throw Error('Configuration child did not physically join:' + child.pid)
  }
}
;(async () => {
  try {
    await scenario(
      'repeated-inline-selection',
      false,
      async ({ dir, configuration, select }) => {
        const first = select()
        await configuration.setup(first)
        assert.deepEqual(
          first.map((project) => project.provide.nested.count),
          [1, 2]
        )
        first[0].provide.nested.count = 99
        const selected = [select()[0]]
        await configuration.setup(selected)
        assert.equal(selected[0].provide.nested.count, 1)
        assert.notEqual(
          selected[0].provide.nested,
          configuration.config.projects[0].provide.nested
        )
        const one = await configuration.evaluateWatchTriggers([
          dir + '/payload.mjs',
        ])
        const two = await configuration.evaluateWatchTriggers([
          dir + '/payload.mjs',
        ])
        assert.equal(one[0].tests[0], dir + '/case-1.test.mjs')
        assert.equal(two[0].tests[0], dir + '/case-2.test.mjs')
        return {
          generations: 2,
          freshProvidedValues: true,
          actualSameRealmCounter: [1, 2],
        }
      }
    )
    await scenario(
      'unknown-selected-id',
      false,
      async ({ configuration, select }) => {
        const selected = select()[0]
        selected.profile = { ...selected.profile, id: 'foreign-owner' }
        await assert.rejects(
          configuration.setup([selected]),
          /Unknown project in retained watch trigger configuration/
        )
        return { unknownIdRejected: true }
      }
    )
    await scenario(
      'aborted-trigger-owner',
      false,
      async ({ configuration, lifetime, select }) => {
        const error = new Error('actual trigger owner abort')
        lifetime.abort(error)
        await assert.rejects(
          configuration.setup(select()),
          (reason) => reason === error
        )
        return { actualAbortIdentityHeld: true }
      }
    )
    await scenario(
      'disposed-trigger-owner',
      false,
      async ({ configuration, select }) => {
        await configuration.dispose()
        await assert.rejects(
          configuration.setup(select()),
          /retained watch trigger configuration is unavailable/
        )
        return { disposedOwnerRejected: true }
      }
    )
    await scenario(
      'configured-real-global-setup',
      true,
      async ({ dir, configuration, select }) => {
        const selected = select()
        await configuration.setup(selected)
        assert.equal(selected[0].provide.actualSetup, 42)
        assert.equal(fs.readFileSync(dir + '/global.log', 'utf8'), 'setup\n')
        return { actualGlobalSetupNotSkipped: true }
      }
    )
    await scenario(
      'selected-real-global-setup',
      false,
      async ({ dir, configuration, select }) => {
        const selected = select()
        selected[0].globalSetup = ['global.mjs']
        await configuration.setup(selected)
        assert.equal(selected[0].provide.actualSetup, 42)
        assert.equal(fs.readFileSync(dir + '/global.log', 'utf8'), 'setup\n')
        return { selectedActualGlobalNotSkipped: true }
      }
    )
    for (const result of scenarios) {
      const setup = result.requests.filter(
        (request) => request.type === 'setup'
      )
      assert.equal(
        setup.length,
        result.name.endsWith('real-global-setup') ? 1 : 0
      )
    }
    for (const name of [
      'configured-real-global-setup',
      'selected-real-global-setup',
    ])
      assert.equal(
        fs.readFileSync(base + '/' + name + '/global.log', 'utf8'),
        'setup\nteardown\n'
      )
    assert.deepEqual(pins(), before)
    if (process.argv[3])
      fs.writeFileSync(
        process.argv[3],
        JSON.stringify(
          {
            scope:
              'Actual published configuration API and worker/loader/process realms; no CLI/compiler/Native run',
            runtime: process.version,
            scenarios,
            allConfigurationChildrenJoined: true,
            noExtraIpcListeners: true,
            rootDistPinsHeld: true,
          },
          null,
          2
        ) + '\n'
      )
    console.log(
      JSON.stringify({
        scenarios: scenarios.length,
        allActualWorkersJoined: true,
        emptySetupRpcs: 0,
        actualGlobalSetupRpcs: 2,
        freshProvide: true,
        actualMapperCounterHeld: true,
      })
    )
  } catch (error) {
    throw error
  } finally {
    cp.fork = originalFork
    if (hadTrace) process.env.NEXT_TEST_TRIGGER_SETUP_TRACE = priorTrace
    else delete process.env.NEXT_TEST_TRIGGER_SETUP_TRACE
    fs.rmSync(base, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
