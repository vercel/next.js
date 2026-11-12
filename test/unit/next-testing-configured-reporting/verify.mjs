import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <source-or-consumer-root> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const body = readFileSync(join(directory, 'report.test.ts.txt'), 'utf8')
const reporter = readFileSync(join(directory, 'reporter.mjs.txt'), 'utf8')
const require = createRequire(join(consumer, 'package.json'))
const next = require.resolve('next/dist/bin/next')
const save = (directory, name, value) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
for (const name of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[name]
const cases = [
  ['configured reporter passes', 'passed'],
  ['configured reporter skips', 'skipped'],
  ['configured reporter todo', 'todo'],
]
function assertJsonReport(report) {
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, 3)
  assert.equal(report.numPassedTests, 1)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 1)
  assert.equal(report.numTodoTests, 1)
  assert.equal(report.testResults.length, 1)
  assert.equal(report.testResults[0].status, 'passed')
  assert.equal(report.testResults[0].message, '')
  assert.deepEqual(
    report.testResults[0].assertionResults.map((test) => [
      test.fullName,
      test.status,
    ]),
    cases
  )
  for (const test of report.testResults[0].assertionResults)
    assert.deepEqual(test.failureMessages, [])
}
const plans = {
  'json-string': {
    reporters: 'json',
    flags: [],
    outputFile: 'out/configured.json',
    outputs: ['configured.json'],
  },
  'json-junit-map': {
    reporters: ['json', 'junit'],
    flags: [],
    outputFile: { json: 'out/configured.json', junit: 'out/configured.xml' },
    outputs: ['configured.json', 'configured.xml'],
  },
  'cli-both-overrides': {
    reporters: ['json'],
    flags: ['--reporter=junit', '--outputFile=out/cli.xml'],
    outputFile: 'out/configured.json',
    outputs: ['cli.xml'],
  },
  'cli-output-only': {
    reporters: ['json'],
    flags: ['--outputFile=out/cli.json'],
    outputFile: 'out/configured.json',
    outputs: ['cli.json'],
  },
  'cli-reporter-only': {
    reporters: ['json'],
    flags: ['--reporter=junit'],
    outputFile: 'out/configured.json',
    outputs: ['configured.json'],
  },
  'configured-custom-file': {
    reporters: ['./reporter.mjs'],
    flags: [],
    outputs: ['custom.jsonl'],
  },
}
const attributes = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [
      key,
      value,
    ])
  )
const decode = (text) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
function junitModel(text) {
  const suites = [
    ...text.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g),
  ].map(([, props, body]) => ({
    attributes: Object.fromEntries(
      Object.entries(attributes(props)).filter(
        ([key]) => !['timestamp', 'time', 'hostname'].includes(key)
      )
    ),
    cases: [
      ...body.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
    ].map(([, props, body = '']) => ({
      attributes: Object.fromEntries(
        Object.entries(attributes(props)).filter(([key]) => key !== 'time')
      ),
      skipped: /<skipped\b/.test(body),
      failure: /<failure\b/.test(body),
      error: /<error\b/.test(body),
    })),
  }))
  const authorRows = [
    ...text.matchAll(/<system-out>([\s\S]*?)<\/system-out>/g),
  ].flatMap(([, body]) =>
    decode(body)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('CONFIG_REPORT_ROW '))
      .map((line) => JSON.parse(line.slice('CONFIG_REPORT_ROW '.length)))
  )
  return { suites, authorRows }
}
const runs = []
for (const mode of ['development', 'production']) {
  for (const [name, plan] of Object.entries(plans)) {
    const evidence = join(output, mode + '-' + name)
    mkdirSync(evidence)
    const fixture = join(
      consumer,
      '.next-test-configured-reporting-' + randomUUID()
    )
    mkdirSync(fixture)
    symlinkSync(
      join(consumer, 'node_modules'),
      join(fixture, 'node_modules'),
      'dir'
    )
    writeFileSync(
      join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    writeFileSync(join(fixture, 'report.test.ts'), body)
    writeFileSync(join(fixture, 'reporter.mjs'), reporter)
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const test = {
      include: ['report.test.ts'],
      maxWorkers: 1,
      fileParallelism: false,
      cache: false,
      testTimeout: 5000,
      hookTimeout: 5000,
      mode,
      environment: 'node',
      reporters: plan.reporters,
      outputFile: plan.outputFile,
    }
    writeFileSync(
      join(fixture, 'vitest.config.mjs'),
      'export default ' + JSON.stringify({ test }) + '\n'
    )
    let joined = false
    try {
      const args = [next, 'test', fixture, '--run', ...plan.flags]
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env: { ...env, NODE_ENV: mode },
        auditDir: join(evidence, 'owners'),
        timeoutMs: 120000,
      })
      save(evidence, 'result.json', result)
      writeFileSync(join(evidence, 'stdout.log'), result.stdout)
      writeFileSync(join(evidence, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, mode + '-' + name)
      joined = true
      assert.equal(
        result.status,
        0,
        `Configured reporter failed; see ${evidence}`
      )
      const outputs = {}
      for (const name of [
        'configured.json',
        'configured.xml',
        'cli.xml',
        'cli.json',
      ]) {
        const path = join(fixture, 'out', name)
        if (existsSync(path)) outputs[name] = readFileSync(path, 'utf8')
      }
      if (existsSync(join(fixture, 'custom.jsonl')))
        outputs['custom.jsonl'] = readFileSync(
          join(fixture, 'custom.jsonl'),
          'utf8'
        )
      for (const [name, content] of Object.entries(outputs))
        writeFileSync(join(evidence, name), content)
      const json = Object.values(outputs).find(
        (text) => text.trim().startsWith('{') && !text.includes('"phase"')
      )
      const xml = Object.values(outputs).find((text) =>
        text.trim().startsWith('<?xml')
      )
      assert.deepEqual(Object.keys(outputs), plan.outputs)
      if (json) assertJsonReport(JSON.parse(json))
      if (xml) {
        const actual = junitModel(xml)
        assert.equal(actual.suites.length, 1)
        assert.deepEqual(actual.suites[0].attributes, {
          name: 'report.test.ts',
          tests: '3',
          failures: '0',
          errors: '0',
          skipped: '2',
        })
        assert.deepEqual(
          actual.suites[0].cases.map((test) => [
            test.attributes.name,
            test.skipped,
          ]),
          cases.map(([name, status]) => [name, status !== 'passed'])
        )
        for (const test of actual.suites[0].cases) {
          assert.equal(test.attributes.classname, 'report.test.ts')
          assert.equal(test.failure, false)
          assert.equal(test.error, false)
        }
        assert.deepEqual(actual.authorRows, [{ label: 'body', answer: 42 }])
      }
      if (outputs['custom.jsonl']) {
        assert.deepEqual(
          outputs['custom.jsonl']
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
          [
            { phase: 'init', root: true },
            {
              phase: 'module',
              state: 'passed',
              names: cases.map(([name]) => name),
            },
            { phase: 'run', count: 1, errors: 0, reason: 'passed' },
            { phase: 'close' },
          ]
        )
      }
      runs.push({
        mode,
        name,
        outputFiles: Object.keys(outputs),
        actualCases: 3,
        configuredReporterBehaviorChecked: true,
        allOwnersJoined: true,
      })
    } finally {
      if (joined) rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        allOwnersJoined: joined,
        fixtureAbsent: !existsSync(fixture),
      })
    }
  }
}
save(output, 'VERIFIED.json', {
  profiles: runs.length,
  runs,
  actualCases: runs.length * 3,
  allConfiguredArtifactsAndIndependentCliOverridesMatched: true,
  relativeCustomReporterRootAndCloseMatched: true,
  allOwnersJoined: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
})
