import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import inputs from './custom-completion-inputs.cjs'

export async function runCompletion(family, check) {
  const [consumerArg, outputArg, name] = process.argv.slice(2)
  assert(consumerArg && outputArg && name)
  const consumer = resolve(consumerArg)
  const output = resolve(outputArg)
  const load = createRequire(join(consumer, 'package.json'))
  if (!process.argv.includes('--source'))
    for (const module of ['vitest', 'vite', '@vitest/mocker'])
      assert.throws(() => load.resolve(module))
  const input = inputs.completionInputs(family, name)
  const common = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/custom-reporter-completion'
  )
  const fixture = fs.mkdtempSync(join(consumer, '.next-custom-' + family + '-'))
  fs.mkdirSync(output, { recursive: true })
  let joined = false
  try {
    for (const file of [
      'coverage-provider.mjs',
      'contract.case.mjs',
      'vitest.config.mjs',
    ])
      fs.copyFileSync(join(common, file), join(fixture, file))
    for (const [file, source] of Object.entries(input.files))
      fs.copyFileSync(source, join(fixture, file))
    fs.writeFileSync(join(fixture, 'package.json'), '{}\n')
    fs.writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    fs.mkdirSync(join(fixture, '__snapshots__'))
    if (input.priorJSONBytes !== null)
      fs.writeFileSync(join(fixture, 'cases.json'), input.priorJSONBytes)
    const env = {
      ...process.env,
      CI: '1',
      NODE_ENV: 'development',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const owner = await runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        ...input.reporters.map(
          (value) =>
            '--reporter=' +
            (value.endsWith('.mjs') ? join(fixture, value) : value)
        ),
        '--outputFile=' + join(fixture, 'cases.json'),
      ],
      { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
    )
    fs.writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'custom reporter ' + family + ' ' + name)
    joined = true
    for (const file of [
      'provider-trace.jsonl',
      'cases.json',
      'custom-coverage.json',
    ])
      if (fs.existsSync(join(fixture, file)))
        fs.copyFileSync(join(fixture, file), join(output, file))
    const trace = fs
      .readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    const bytes = fs.existsSync(join(fixture, 'cases.json'))
      ? fs.readFileSync(join(fixture, 'cases.json'), 'utf8')
      : null
    const publication =
      input.priorJSONBytes !== null && bytes === input.priorJSONBytes
        ? 'preserved'
        : bytes !== null
          ? 'written'
          : 'none'
    const report = publication === 'written' ? JSON.parse(bytes) : null
    checkCollectedReport({
      status: owner.status,
      trace,
      report,
      priorJSON: input.priorJSONBytes !== null,
      hasProviderReport: fs.existsSync(join(fixture, 'custom-coverage.json')),
    })
    check({
      name,
      trace: trace.slice(10),
      publication,
      report,
      stderr: owner.stderr,
      priorJSON: input.priorJSONBytes !== null,
    })
    assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
    fs.writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify({
        name,
        providerCollectionSettled: true,
        reporterDispatchAndPublication: true,
        failedCaseAndCoverageRetained: true,
        allActualProcessesJoined: true,
      }) + '\n'
    )
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    fs.writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({
        physicallyJoined: joined,
        fixtureRetired: !fs.existsSync(fixture),
      }) + '\n'
    )
  }
}

export function checkCollectedReport({
  status,
  trace,
  report,
  priorJSON,
  hasProviderReport,
}) {
  // Collection must settle before reporter completion, even when reporters fail.
  assert.equal(status, 1)
  assert.deepEqual(
    trace.slice(0, 10).map((row) => row.name),
    [
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
  )
  assert.deepEqual(trace[7], {
    name: 'suite',
    coverage: { releasePayload: 42 },
    testFiles: ['contract.case.mjs'],
  })
  assert.deepEqual(trace[9], { name: 'generate', jsonExists: priorJSON })
  assert.equal(hasProviderReport, false)
  if (report !== null) {
    assert.equal(report.next.version, 1)
    assert.equal(report.numTotalTests, 2)
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.numFailedTests, 1)
    assert.equal(report.success, false)
    assert.deepEqual(
      report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => [test.title, test.status])
      ),
      [
        ['custom provider owns coverage collection', 'passed'],
        ['actual failed body113', 'failed'],
      ]
    )
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    assert.deepEqual(cases[0].failureMessages, [])
    assert.equal(cases[1].failureMessages.length, 1)
    assert(cases[1].failureMessages[0].includes('expected 1 to be 2'))
    assert.deepEqual(report.coverageMap, {
      stage: 'generated',
      payloads: [{ releasePayload: 42 }],
    })
  }
}
