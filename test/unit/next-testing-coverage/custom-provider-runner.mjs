import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import {
  generatedScenarios,
  failureScenarios,
  productionScenarios,
} from './custom-provider-scenarios.cjs'

const lifecycle = [
  'get-provider',
  'initialize',
  'resolve',
  'clean',
  'run-start',
  'start',
  'take',
  'suite',
  'stop',
  'generate',
]
const payloads = [{ releasePayload: 42 }]
const values = {
  undefined: undefined,
  null: null,
  false: false,
  zero: 0,
  emptyObject: {},
  emptyArray: [],
  nan: NaN,
  infinity: Infinity,
  string: 'opaque-custom-data',
}
function waitFor(file) {
  return new Promise((resolve, reject) => {
    const done = (error) => {
      fs.unwatchFile(file, check)
      clearTimeout(timer)
      error ? reject(error) : resolve()
    }
    const check = () => {
      if (fs.existsSync(file)) done()
    }
    const timer = setTimeout(
      () => done(new Error('Actual JSON did not publish while callback held')),
      30000
    )
    fs.watchFile(file, { interval: 10 }, check)
    check()
  })
}
export async function runCustomProviderScenario(family) {
  const [consumerArg, outputArg, name] = process.argv.slice(2)
  assert(consumerArg && outputArg && name)
  const consumer = resolve(consumerArg),
    output = resolve(outputArg)
  const load = createRequire(join(consumer, 'package.json'))
  if (!process.argv.includes('--source'))
    for (const dependency of ['vitest', 'vite', '@vitest/mocker'])
      assert.throws(() => load.resolve(dependency))
  const scenarios =
    family === 'generated'
      ? generatedScenarios
      : family === 'failure'
        ? failureScenarios
        : productionScenarios
  assert(scenarios.includes(name), `Unknown custom provider scenario: ${name}`)
  const mode = family === 'production' ? 'production' : 'development'
  const failure = failureScenarios.includes(name)
  const noJSON = name.startsWith('nojson-function')
  const hasJSON = !noJSON && !['generator-reject', 'json-bigint'].includes(name)
  const hasProviderReport = ![
    'mutation-false',
    'hook-reject',
    'generator-reject',
    'json-bigint',
  ].includes(name)
  const caseCount = failure || /^(basic|production)-/.test(name) ? 2 : 1
  const testFile = name.endsWith('-js')
    ? 'contract.case.js'
    : 'contract.case.mjs'
  const fixtureSources = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/custom-provider'
  )
  const fixture = fs.mkdtempSync(join(consumer, '.next-custom-provider-'))
  fs.mkdirSync(output, { recursive: true })
  let pending,
    joined = false
  const release = join(output, 'release')
  try {
    fs.copyFileSync(
      join(fixtureSources, 'provider.mjs'),
      join(fixture, 'coverage-provider.mjs')
    )
    let body =
      "import { test, expect } from 'vitest'\ntest('custom provider owns coverage collection', () => expect(42).toBe(42))\n"
    if (failure) body += "test('actual failed body113',()=>expect(1).toBe(2))\n"
    else if (caseCount === 2)
      body += `test('compiled environment', () => expect(process.env.NODE_ENV).toBe(${JSON.stringify(mode)}))\n`
    fs.writeFileSync(join(fixture, testFile), body)
    fs.writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
    fs.writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    fs.writeFileSync(
      join(fixture, 'next.test.config.mjs'),
      'export default ' +
        JSON.stringify({
          test: {
            projects: [{ test: { name: mode, mode, include: [testFile] } }],
            maxWorkers: 1,
            coverage: {
              enabled: true,
              provider: 'custom',
              customProviderModule: './coverage-provider.mjs',
              ...(failure
                ? { reportOnFailure: name !== 'mutation-false' }
                : {}),
            },
          },
        }) +
        '\n'
    )
    fs.mkdirSync(join(fixture, '__snapshots__'))
    const reporters = noJSON
      ? [name.endsWith('-dot') ? 'dot' : 'default']
      : ['json']
    if (failure || name.startsWith('modern-')) reporters.unshift('observer.mjs')
    if (name === 'two-reporters') reporters.unshift('first.mjs', 'second.mjs')
    for (const reporter of reporters.filter((name) => name.endsWith('.mjs')))
      fs.copyFileSync(join(fixtureSources, reporter), join(fixture, reporter))
    const env = {
      ...process.env,
      CI: '1',
      NODE_ENV: mode,
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      CUSTOM_COVERAGE_SCENARIO: name,
      CUSTOM_COVERAGE_FAILURE: failure ? '1' : '0',
      CUSTOM_COVERAGE_RELEASE: release,
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    pending = runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        ...reporters.map(
          (reporter) =>
            '--reporter=' +
            (reporter.endsWith('.mjs') ? join(fixture, reporter) : reporter)
        ),
        ...(noJSON ? [] : ['--outputFile=' + join(fixture, 'cases.json')]),
      ],
      { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
    )
    if (name === 'two-reporters') {
      await waitFor(join(fixture, 'cases.json'))
      const heldTrace = fs
        .readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
      assert(heldTrace.some((row) => row.name === 'first-enter'))
      assert(heldTrace.some((row) => row.name === 'second-enter'))
      assert(!heldTrace.some((row) => row.name === 'report'))
      fs.writeFileSync(release, 'release after standard JSON publication')
    }
    const owner = await pending
    fs.writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'custom provider ' + name)
    joined = true
    assert.equal(owner.status, failure ? 1 : 0, owner.stderr)
    assert.equal(fs.existsSync(join(fixture, 'cases.json')), hasJSON)
    assert.equal(
      fs.existsSync(join(fixture, 'custom-coverage.json')),
      hasProviderReport
    )
    const trace = fs
      .readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    const names = trace.map((row) => row.name)
    assert.deepEqual(names.slice(0, lifecycle.length), lifecycle)
    const suite = trace.find((row) => row.name === 'suite')
    assert.deepEqual(suite.coverage, { releasePayload: 42 })
    assert.deepEqual(suite.testFiles, [testFile])
    if (failure) {
      const tail = scenarioTail(name)
      assert.deepEqual(names.slice(lifecycle.length), tail)
      if (hasJSON) {
        const start = trace.find((row) => row.name === 'failure-enter')
        assert.equal(start.jsonExists, true)
        assert.deepEqual(start.mapSnapshot, { stage: 'generated', payloads })
        const leave = trace.find((row) => row.name === 'failure-leave')
        if (leave) assert.equal(leave.generatedStage, 'mutated')
      }
      if (name === 'hook-reject')
        assert.match(owner.stderr, /actual113 failure hook/)
      if (name === 'generator-reject')
        assert.match(owner.stderr, /actual113 generator failure/)
      if (name === 'json-bigint') assert.match(owner.stderr, /BigInt/)
    } else {
      const extras =
        name === 'modern-identity'
          ? [
              'generate-observed',
              'reporter-modern',
              'report-observed',
              'report',
            ]
          : name === 'modern-unmodified'
            ? ['reporter-modern', 'report']
            : name === 'two-reporters'
              ? ['first-enter', 'second-enter', 'report']
              : ['report']
      assert.deepEqual(names.slice(lifecycle.length), extras)
      const modern = trace.find((row) => row.name === 'reporter-modern')
      if (modern)
        assert.deepEqual(modern, {
          name: 'reporter-modern',
          reason: 'passed',
          customReportExists: false,
          standardJSONExists: false,
        })
      const identity = trace.find((row) => row.name === 'report-observed')
      if (identity)
        assert.deepEqual(identity, {
          name: 'report-observed',
          sameGenerated: true,
          standardJSONExists: true,
        })
    }
    if (hasJSON) {
      const report = JSON.parse(fs.readFileSync(join(fixture, 'cases.json')))
      assert.equal(report.numTotalTests, caseCount)
      assert.equal(report.numPassedTests, failure ? 1 : caseCount)
      assert.equal(report.numFailedTests, failure ? 1 : 0)
      assert.equal(report.numPendingTests, 0)
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      assert.deepEqual(
        cases.map((test) => test.status).sort(),
        failure ? ['failed', 'passed'] : Array(caseCount).fill('passed')
      )
      if (failure)
        assert(
          cases.some((test) =>
            test.failureMessages.some((message) =>
              /expected 1 to be 2/.test(message)
            )
          )
        )
      else assert(cases.every((test) => test.failureMessages.length === 0))
      if (name.startsWith('value-')) {
        const value = values[name.slice(6)]
        const expectedMap = value
          ? JSON.parse(JSON.stringify(value))
          : undefined
        assert.deepEqual(report.coverageMap, expectedMap)
      } else
        assert.deepEqual(
          report.coverageMap,
          failure ? { stage: 'generated', payloads } : { payloads }
        )
    }
    if (hasProviderReport) {
      const report = JSON.parse(
        fs.readFileSync(join(fixture, 'custom-coverage.json'))
      )
      if (name.startsWith('value-')) {
        const value = values[name.slice(6)]
        assert.deepEqual(
          report,
          JSON.parse(
            JSON.stringify({
              type: typeof value,
              isNaN: Number.isNaN(value),
              value,
            })
          )
        )
        const emitted = trace.find((row) => row.name === 'report')
        assert.equal(emitted.sameGenerated, true)
        assert.equal(emitted.standardJSONExists, true)
      } else if (noJSON)
        assert.deepEqual(report, { same: true, type: 'function', result: 42 })
      else if (failure)
        assert.deepEqual(report, {
          same: true,
          coverage: { stage: 'mutated', payloads },
          mapSnapshot: { stage: 'generated', payloads },
        })
      else assert.deepEqual(report, { payloads })
    }
    assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
    fs.writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          name,
          mode,
          cases: caseCount,
          providerLifecycleAndPublication: true,
          generatedResultIdentity: true,
          caseOutcomesAndErrors: true,
          allActualProcessesJoined: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    fs.writeFileSync(release, 'final release')
    if (pending && !joined) {
      const owner = await pending
      assertOwnedNodeCompleted(owner, 'custom provider cleanup ' + name)
      joined = true
    }
    if (joined || !pending) fs.rmSync(fixture, { recursive: true, force: true })
    fs.writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({
        physicallyJoined: joined,
        fixtureRetired: !fs.existsSync(fixture),
      }) + '\n'
    )
  }
}
function scenarioTail(name) {
  if (name === 'generator-reject') return []
  const modern = ['modern-enter', 'modern-complete']
  if (name === 'json-bigint') return modern
  const failure = [...modern, 'failure-enter']
  if (name === 'hook-reject') return failure
  if (name === 'async-true') failure.push('failure-async-resume')
  failure.push(
    ...(name === 'thenable-true'
      ? ['failure-then-access', 'failure-then-complete']
      : ['failure-leave'])
  )
  if (name !== 'mutation-false') failure.push('report')
  return failure
}
