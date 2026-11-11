import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { projectCleanupReport } from '../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/project.mjs'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
const [consumerArg, outputArg, playwrightArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer-root> <new-evidence-dir> [existing-playwright-module]'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  directory = path.dirname(fileURLToPath(import.meta.url))
fs.mkdirSync(output)
const expected = JSON.parse(
    fs.readFileSync(path.join(directory, 'reference.json'), 'utf8')
  ),
  require = createRequire(path.join(consumer, 'package.json')),
  next = require.resolve('next/dist/bin/next')
const hash = (value) => createHash('sha256').update(value).digest('hex'),
  save = (where, name, value) =>
    fs.writeFileSync(
      path.join(where, name),
      JSON.stringify(value, null, 2) + '\n'
    )
const graph = Object.fromEntries(
  ['package.json', 'pnpm-lock.yaml'].map((name) => [
    name,
    hash(fs.readFileSync(path.join(consumer, name))),
  ])
)
const env = { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const fixtureFiles = {
  original: 'locator-fill-ctor-order.test.mjs.txt',
  getter: 'locator-fill-resolve-getter.test.mjs.txt',
}
const profiles = []
function semanticRows(rows) {
  return rows.map((row) => {
    const value = row.value,
      trace = value.trace,
      constructors = trace.flatMap((event, index) =>
        event.event === 'constructor' ? [{ event, index }] : []
      )
    assert(constructors.length > 0)
    assert(
      constructors[0].index >
        trace.findIndex((event) => event.event === 'after-create')
    )
    const fields = trace.flatMap((event, index) =>
      event.event.startsWith('field:') ? [index] : []
    )
    if (value.variant === 'forwarded') {
      assert(
        fields.length > 0 &&
          fields.every((index) => index > constructors[0].index)
      )
      assert(constructors.slice(1).every(({ index }) => index > fields.at(-1)))
    } else {
      assert.equal(constructors.length, 1)
      assert.equal(fields.length, 0)
    }
    for (const { event } of constructors)
      assert.deepEqual(event, { event: 'constructor' })
    return {
      task: row.task,
      variant: value.variant,
      events: value.events,
      value: value.value,
      error: value.error,
      orderedDescriptorAndGetterRows: trace.filter(
        (event) =>
          event.event !== 'constructor' && event.event !== 'actual-frame'
      ),
      actualFrameOrder: trace
        .filter((event) => event.event === 'actual-frame')
        .map((event) => event.remaining),
    }
  })
}
for (const [kind, name] of Object.entries(fixtureFiles))
  for (const mode of ['development', 'production']) {
    const evidence = path.join(output, kind + '-' + mode)
    fs.mkdirSync(evidence)
    const fixture = fs.mkdtempSync(
        path.join(consumer, '.next-test-task-update-promises-')
      ),
      source = fs.readFileSync(path.join(directory, 'cases', name))
    assert.equal(hash(source), expected.inputs[name])
    fs.writeFileSync(path.join(fixture, 'fixtures.test.mjs'), source)
    fs.copyFileSync(
      resolveFixturePath(
        path.join(
          directory,
          '../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/reporter.mjs'
        )
      ),
      path.join(fixture, 'reporter.mjs')
    )
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    if (playwrightArg) {
      fs.mkdirSync(path.join(fixture, 'node_modules'))
      for (const name of fs.readdirSync(path.join(consumer, 'node_modules')))
        if (name !== 'playwright')
          fs.symlinkSync(
            path.join(consumer, 'node_modules', name),
            path.join(fixture, 'node_modules', name),
            fs.statSync(path.join(consumer, 'node_modules', name)).isDirectory()
              ? 'dir'
              : 'file'
          )
      fs.symlinkSync(
        fs.realpathSync(playwrightArg),
        path.join(fixture, 'node_modules/playwright'),
        'dir'
      )
    } else
      fs.symlinkSync(
        path.join(consumer, 'node_modules'),
        path.join(fixture, 'node_modules'),
        'dir'
      )
    const project = createRequire(path.join(fixture, 'package.json')),
      version = project('playwright/package.json').version,
      binary = project('playwright').chromium.executablePath()
    assert(
      fs.existsSync(binary),
      'Declared Playwright Chromium binary must already be installed: ' + binary
    )
    save(evidence, 'driver.json', {
      version,
      module: project.resolve('playwright'),
      binary,
      projectScopedExistingDependency: true,
    })
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        type: 'module',
        private: true,
        dependencies: { playwright: version },
      }) + '\n'
    )
    const test = {
      include: ['fixtures.test.mjs'],
      maxWorkers: 1,
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
      testTimeout: 5000,
      hookTimeout: 5000,
      includeTaskLocation: false,
      environment: 'browser',
      mode,
    }
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({ test }) + '\n'
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
      args,
      fixture,
      test,
      inputSHA256: hash(source),
      cliDeadlineMs: 120000,
      rawConstructorCountsNotNormalized: true,
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
        'task-update Promise ' + kind + ' ' + mode
      )
      joined = true
      assert.equal(owner.status, 0)
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'fixtures.test.mjs'))),
        expected.inputs[name]
      )
      const report = JSON.parse(
          fs.readFileSync(path.join(evidence, 'report.raw.json'))
        ),
        trace = JSON.parse(
          fs.readFileSync(path.join(evidence, 'trace.raw.jsonl.complete.json'))
        )
      const projection = projectCleanupReport(report, trace, owner.status)
      save(evidence, 'projection.json', projection)
      assert.equal(report.numTotalTests, 2)
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.success, true)
      const model = semanticRows(projection.rows),
        reference = semanticRows(expected.models[kind][mode].rows)
      save(evidence, 'semantic-model.json', model)
      assert.deepEqual(model, reference)
      const naturalConstructors = projection.rows.map((row) => ({
        task: row.task,
        count: row.value.trace.filter((event) => event.event === 'constructor')
          .length,
        fullRawTrace: row.value.trace,
      }))
      save(evidence, 'natural-constructor-observations.json', {
        naturalConstructors,
        explicitRemainingScope:
          'Independent RPC publication can occur during the authored constructor window. Every count and raw frame/RPC interleaving is retained; no universal count or wall-clock/interleaving equivalence claim.',
      })
      profiles.push({
        kind,
        mode,
        cases: 2,
        driver: version,
        genuineInputDescriptorGetterAndVetoFieldsExact: true,
        rawConstructorAndFrameRowsRetained: true,
        allOwnersJoined: true,
      })
    } finally {
      if (joined) fs.rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        allOwnersJoined: joined,
        fixtureAbsent: !fs.existsSync(fixture),
      })
    }
  }
for (const [name, pin] of Object.entries(graph))
  assert.equal(hash(fs.readFileSync(path.join(consumer, name))), pin)
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  runs: profiles,
  cases: profiles.reduce((sum, row) => sum + row.cases, 0),
  genuineInputDescriptorGetterAndVetoFieldsExact: true,
  rawConstructorAndFrameRowsRetained: true,
  sourceOrInstalledGraphPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
  noGeneralNaturalConstructorCountOrHistoricalInput0FixClaim: true,
})
