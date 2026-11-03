import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildNativeFormatConfiguration } from './error-format-options-driver.mjs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { projectCleanupReport } from '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/project.mjs'

const [consumerArg, outputArg, dependenciesArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg && dependenciesArg,
  'Usage: node verify-error-format-options.mjs <consumer-root> <new-evidence-dir-inside-consumer> <existing-physical-dependency-root>'
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
      'Fixture, evidence and dependency paths must remain inside the consumer: ' +
        where
    )
  }
insideConsumer(dependencies)
insideConsumer(output)
insideConsumer(fs.realpathSync(path.dirname(output)))
fs.mkdirSync(output)
const authoring = path.join(output, 'authored-configuration')
fs.mkdirSync(authoring)
for (const name of ['options-cases.mjs', 'single-case-builder.mjs'])
  fs.copyFileSync(
    path.join(directory, name + '.txt'),
    path.join(authoring, name)
  )
const { describeSingleCases, buildSingleCaseConfiguration } = await import(
  pathToFileURL(path.join(authoring, 'single-case-builder.mjs')).href
)
const expected = JSON.parse(
    fs.readFileSync(path.join(directory, 'error-format-options.reference.json'))
  ),
  fixtureSource = fs.readFileSync(
    path.join(directory, 'error-format-options.test.mjs.txt')
  ),
  cases = describeSingleCases(),
  inputPins = Object.fromEntries(
    [
      'error-format-options.test.mjs.txt',
      'options-cases.mjs.txt',
      'single-case-builder.mjs.txt',
      'error-format-options.descriptions.json',
      'error-format-options.reference.json',
      'error-format-options-driver.mjs',
    ].map((name) => [name, hash(fs.readFileSync(path.join(directory, name)))])
  )
assert.equal(cases.length, 36)
assert.equal(new Set(cases.map((entry) => entry.id)).size, 36)
assert.deepEqual(
  cases,
  JSON.parse(
    fs.readFileSync(
      path.join(directory, 'error-format-options.descriptions.json')
    )
  )
)
assert.equal(inputPins['options-cases.mjs.txt'], expected.configurationInput)
assert.equal(
  inputPins['single-case-builder.mjs.txt'],
  expected.singleCaseBuilderInput
)
assert.equal(
  inputPins['error-format-options.descriptions.json'],
  expected.descriptionInput
)
for (const { id } of cases)
  assert.equal(hash(fixtureSource), expected.inputs[id])
const require = createRequire(path.join(consumer, 'package.json')),
  dependency = createRequire(path.join(dependencies, 'package.json')),
  next = require.resolve('next/dist/bin/next'),
  nextPackage = path.dirname(require.resolve('next/package.json')),
  graph = Object.fromEntries(
    ['package.json', 'pnpm-lock.yaml'].map((name) => [
      name,
      hash(fs.readFileSync(path.join(consumer, name))),
    ])
  ),
  modules = Object.fromEntries(
    ['react', 'react-dom', 'playwright', 'playwright-core', 'scheduler'].map(
      (name) => [
        name,
        {
          directory: fs.realpathSync(
            path.dirname(dependency.resolve(name + '/package.json'))
          ),
          version: dependency(name + '/package.json').version,
        },
      ]
    )
  )
insideConsumer(next)
insideConsumer(nextPackage)
for (const { directory: moduleDirectory } of Object.values(modules))
  insideConsumer(moduleDirectory)
assert.equal(modules.playwright.version, '1.64.0')
assert.equal(modules['playwright-core'].version, '1.64.0')
assert.equal(modules.react.version, '19.2.0')
assert.equal(modules['react-dom'].version, '19.2.0')
assert(
  fs.existsSync(dependency('playwright').chromium.executablePath()),
  'The declared Chromium binary must already be installed'
)
save(output, 'dependencies.json', {
  modules,
  compilerRoot: consumer,
  fixtureLocalLinksOnly: true,
  explicitQualifiedPlaywright164React192Only: true,
})
save(output, 'INPUTS-BEFORE.json', inputPins)
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
for (const { id, group } of cases)
  for (const mode of ['development', 'production']) {
    const evidence = path.join(output, id + '-' + mode)
    fs.mkdirSync(evidence)
    const fixture = fs.mkdtempSync(
      path.join(consumer, '.next-test-browser-error-format-options-')
    )
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
    const { configuration, source } = buildNativeFormatConfiguration(
      buildSingleCaseConfiguration,
      id,
      mode,
      path.join(fixture, 'unused-genuine-cache')
    )
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    fs.writeFileSync(path.join(fixture, 'next.test.config.mjs'), source)
    fs.writeFileSync(path.join(evidence, 'next.test.config.mjs.txt'), source)
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
      id,
      group,
      mode,
      args,
      fixture,
      sourceSHA256: hash(fixtureSource),
      configSHA256: hash(source),
      configurationInputPins: inputPins,
      rootMaxWorkers: configuration.test.maxWorkers,
      projects: configuration.test.projects.length,
      instances: configuration.test.projects[0].test.browser.instances.length,
      ownPerProjectMaxWorkers: Object.hasOwn(
        configuration.test.projects[0].test,
        'maxWorkers'
      ),
      cliDeadlineMs: 120000,
      driverAdaptation: {
        removedOnly: ['cacheDir', 'browser.provider'],
        addedOnly: ['environment', 'mode'],
        optionExtendsProvideBudgetAndInstanceShapesExact: true,
        undefinedOwnPropertiesPreserved: true,
      },
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
      assertOwnedNodeCompleted(owner, 'Browser errorFormat option ' + id + mode)
      joined = true
      const report = JSON.parse(
          fs.readFileSync(path.join(evidence, 'report.raw.json'))
        ),
        trace = JSON.parse(
          fs.readFileSync(path.join(evidence, 'trace.raw.jsonl.complete.json'))
        ),
        projection = projectCleanupReport(report, trace, owner.status),
        rawStacks = trace.records
          .filter((event) => event.hook === 'console')
          .flatMap((event) => event.log.content.split('\n'))
          .filter((line) => line.startsWith('BROWSER_NATIVE_RAW_STACK:'))
          .map((line) =>
            JSON.parse(line.slice('BROWSER_NATIVE_RAW_STACK:'.length))
          )
      save(evidence, 'projection.json', projection)
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'fixtures.test.mjs'))),
        expected.inputs[id]
      )
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'next.test.config.mjs'))),
        hash(source)
      )
      assert.equal(owner.status, 0)
      assert.deepEqual(projection, expected.models[id][mode])
      assert.equal(report.numPassedTests, 1)
      assert.equal(rawStacks.length, 1)
      assert.equal(typeof rawStacks[0].stack, 'string')
      profiles.push({
        id,
        group,
        mode,
        cases: 1,
        rows: projection.rows.length,
        nativeStacks: rawStacks.length,
        completeGenuineModelsExact: true,
        allOwnersJoined: true,
      })
      save(output, 'PROGRESS.json', { completed: profiles.length, profiles })
      console.log(JSON.stringify(profiles.at(-1)))
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
assert.equal(profiles.length, 72)
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  cases: profiles.reduce((total, profile) => total + profile.cases, 0),
  rows: profiles.reduce((total, profile) => total + profile.rows, 0),
  runs: profiles,
  observedMaxConcurrentCLIs: 1,
  perCLIDeadlineMs: 120000,
  noAdditionalOuterSupervisorOrDeadline: true,
  completeGenuineModelsExact: true,
  fullNativeStacksRetainedOutsideSemanticProjection: true,
  graphPinsHeld: true,
  inputPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
})
