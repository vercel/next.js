import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { projectCleanupReport } from '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/project.mjs'

const [consumerArg, outputArg, dependenciesArg = consumerArg] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-optional-container.mjs <consumer-root> <new-evidence-dir> [existing-dependency-root]'
)
const consumer = fs.realpathSync(consumerArg),
  dependencies = fs.realpathSync(dependenciesArg),
  output = path.resolve(outputArg),
  directory = path.dirname(fileURLToPath(import.meta.url)),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  save = (where, name, value) =>
    fs.writeFileSync(
      path.join(where, name),
      JSON.stringify(value, null, 2) + '\n'
    ),
  insideConsumer = (where) => {
    const relative = path.relative(consumer, where)
    assert(
      !path.isAbsolute(relative) &&
        relative !== '..' &&
        !relative.startsWith('..' + path.sep),
      'Runtime and fixture paths must remain inside the consumer: ' + where
    )
  },
  referenceSource = fs.readFileSync(
    path.join(directory, 'optional-container.reference.json.txt')
  ),
  expected = JSON.parse(referenceSource),
  fixtureSource = fs.readFileSync(
    path.join(directory, 'optional-container.test.mjs.txt')
  ),
  inputPins = {
    'optional-container.test.mjs.txt': hash(fixtureSource),
    'optional-container.reference.json.txt': hash(referenceSource),
  }
assert.equal(
  inputPins['optional-container.test.mjs.txt'],
  'e919ba18a3454c36e141a4cf5cb86f49fae7c7c84dab46063fb128aa493582ca'
)
assert.equal(
  inputPins['optional-container.reference.json.txt'],
  '745b439dc5c9334a5ac33243461d1294c848a242f5000f34f39d2898758bd0af'
)
assert.equal(hash(fixtureSource), expected.inputSHA256)
insideConsumer(dependencies)
const require = createRequire(path.join(consumer, 'package.json')),
  dependency = createRequire(path.join(dependencies, 'package.json')),
  next = fs.realpathSync(require.resolve('next/dist/bin/next')),
  nextPackage = fs.realpathSync(
    path.dirname(require.resolve('next/package.json'))
  ),
  graph = Object.fromEntries(
    ['package.json', 'pnpm-lock.yaml'].map((name) => [
      name,
      hash(fs.readFileSync(path.join(consumer, name))),
    ])
  ),
  modules = Object.fromEntries(
    ['react', 'react-dom', 'playwright'].map((name) => [
      name,
      {
        directory: fs.realpathSync(
          path.dirname(dependency.resolve(name + '/package.json'))
        ),
        version: dependency(name + '/package.json').version,
      },
    ])
  )
insideConsumer(next)
insideConsumer(nextPackage)
for (const { directory: moduleDirectory } of Object.values(modules))
  insideConsumer(moduleDirectory)
assert.equal(modules.react.version, modules['react-dom'].version)
assert(['1.61.0', '1.64.0'].includes(modules.playwright.version))
assert(
  fs.existsSync(dependency('playwright').chromium.executablePath()),
  'The declared Chromium binary must already be installed'
)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
save(output, 'INPUTS-BEFORE.json', inputPins)
save(output, 'dependencies.json', {
  modules,
  compilerRoot: consumer,
  fixtureLocalLinksOnly: true,
  actualRuntimeRootsInsideConsumer: true,
})
const env = { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const profiles = []
for (const format of ['aria', 'html', 'all'])
  for (const mode of ['development', 'production']) {
    assert.equal(expected.models[format][mode].cases.length, 7)
    assert.equal(expected.models[format][mode].rows.length, 7)
    const evidence = path.join(output, format + '-' + mode)
    fs.mkdirSync(evidence)
    const fixture = fs.realpathSync(
      fs.mkdtempSync(
        path.join(consumer, '.next-test-browser-optional-container-')
      )
    )
    insideConsumer(fixture)
    fs.writeFileSync(path.join(fixture, 'fixtures.test.mjs'), fixtureSource)
    fs.copyFileSync(
      path.join(
        directory,
        '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/reporter.mjs'
      ),
      path.join(fixture, 'reporter.mjs')
    )
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        type: 'module',
        private: true,
        dependencies: Object.fromEntries(
          Object.entries(modules).map(([name, value]) => [name, value.version])
        ),
      }) + '\n'
    )
    fs.mkdirSync(path.join(fixture, 'node_modules'))
    fs.symlinkSync(
      nextPackage,
      path.join(fixture, 'node_modules', 'next'),
      'dir'
    )
    for (const [name, value] of Object.entries(modules))
      fs.symlinkSync(
        value.directory,
        path.join(fixture, 'node_modules', name),
        'dir'
      )
    const test = {
        include: ['fixtures.test.mjs'],
        browser: {
          enabled: true,
          headless: true,
          instances: [{ browser: 'chromium', name: 'dom-error-' + format }],
          locators: { errorFormat: format },
        },
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
        name: 'dom-error-' + format,
        provide: { format },
        environment: 'browser',
        mode,
      },
      configuration = { test: { maxWorkers: 1, projects: [{ test }] } },
      configSource = 'export default ' + JSON.stringify(configuration) + '\n'
    assert.equal(Object.hasOwn(test, 'maxWorkers'), false)
    assert.equal(Object.hasOwn(test.browser, 'provider'), false)
    assert.equal(test.browser.instances.length, 1)
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    fs.writeFileSync(path.join(fixture, 'next.test.config.mjs'), configSource)
    fs.writeFileSync(
      path.join(evidence, 'next.test.config.mjs.txt'),
      configSource
    )
    const args = [
      next,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + path.join(fixture, 'reporter.mjs'),
      '--outputFile=' + path.join(evidence, 'report.raw.json'),
    ]
    save(evidence, 'authored.json', {
      format,
      mode,
      args,
      fixture,
      test: configuration.test,
      compilerRoot: consumer,
      sourceSHA256: hash(fixtureSource),
      configSHA256: hash(configSource),
      rootMaxWorkers: 1,
      projects: 1,
      instances: 1,
      ownProjectMaxWorkers: false,
      testTimeoutMs: 5000,
      hookTimeoutMs: 5000,
      cliDeadlineMs: 120000,
    })
    let joined = false
    try {
      const owner = await runOwnedNode(args, {
        cwd: fixture,
        env: {
          ...env,
          NODE_ENV: mode,
          CONCURRENCY_TRACE: path.join(evidence, 'trace.raw.jsonl'),
        },
        auditDir: path.join(evidence, 'owners'),
        timeoutMs: 120000,
      })
      save(evidence, 'owner.json', owner)
      fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(
        owner,
        'Browser optional container ' + format + mode
      )
      joined = true
      const report = JSON.parse(
          fs.readFileSync(path.join(evidence, 'report.raw.json'))
        ),
        trace = JSON.parse(
          fs.readFileSync(path.join(evidence, 'trace.raw.jsonl.complete.json'))
        ),
        projection = projectCleanupReport(report, trace, owner.status),
        nativeStacks = trace.records
          .filter((event) => event.hook === 'console')
          .flatMap((event) => event.log.content.split('\n'))
          .filter((line) => line.startsWith('BROWSER_NATIVE_STACK:'))
          .map((line) => JSON.parse(line.slice('BROWSER_NATIVE_STACK:'.length)))
      save(evidence, 'projection.json', projection)
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'fixtures.test.mjs'))),
        expected.inputSHA256
      )
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'next.test.config.mjs'))),
        hash(configSource)
      )
      assert.equal(owner.status, 0)
      assert.deepEqual(projection, expected.models[format][mode])
      assert.equal(report.numPassedTests, 7)
      assert.equal(projection.cases.length, 7)
      assert.equal(projection.rows.length, 7)
      assert.equal(nativeStacks.length, 7)
      assert(
        nativeStacks.every(
          (error) => typeof error.stack === 'string' && error.stack.length > 0
        )
      )
      profiles.push({
        format,
        mode,
        cases: 7,
        rows: projection.rows.length,
        rawNativeStacks: nativeStacks.length,
        completeModelsExact: true,
        fullNativeStacksRetainedOutsideSemanticProjection: true,
        allOwnersJoined: true,
      })
      save(output, 'PROGRESS.json', { completed: profiles.length, profiles })
    } finally {
      if (joined) fs.rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        allOwnersJoined: joined,
        fixtureAbsent: !fs.existsSync(fixture),
      })
    }
  }
for (const [name, pin] of Object.entries(inputPins))
  assert.equal(hash(fs.readFileSync(path.join(directory, name))), pin)
for (const [name, pin] of Object.entries(graph))
  assert.equal(hash(fs.readFileSync(path.join(consumer, name))), pin)
assert.equal(profiles.length, 6)
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  cases: profiles.reduce((total, profile) => total + profile.cases, 0),
  rows: profiles.reduce((total, profile) => total + profile.rows, 0),
  rawNativeStacks: profiles.reduce(
    (total, profile) => total + profile.rawNativeStacks,
    0
  ),
  runs: profiles,
  completeModelsExact: true,
  fullNativeStacksRetainedOutsideSemanticProjection: true,
  graphPinsHeld: true,
  inputPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
})
