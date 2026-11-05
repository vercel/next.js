import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, , group = 'positive'] = process.argv.slice(2)
assert(['positive', 'load-failure', 'load-owned'].includes(group))
const positive = group === 'positive'
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const inputs = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'normal-suite-records'
)
const load = createRequire(path.join(consumer, 'package.json'))
const body = fs.readFileSync(
  resolveFixturePath(
    path.join(
      inputs,
      positive ? 'positive.test.mjs.txt' : `browser-${group}/suite.test.mjs.txt`
    )
  )
)
const browserVersion = load('playwright/package.json').version
fs.mkdirSync(output, { recursive: true })
for (const mode of ['development', 'production']) {
  const out = path.join(output, mode)
  fs.mkdirSync(out)
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-normal-suite-browser-')
  )
  fs.symlinkSync(
    path.join(consumer, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      type: 'module',
      private: true,
      dependencies: { playwright: browserVersion },
    }) + '\n'
  )
  fs.writeFileSync(path.join(fixture, 'suite.test.mjs'), body)
  fs.writeFileSync(
    path.join(fixture, 'reporter.mjs'),
    `import fs from 'node:fs';export default class {
    onUserConsoleLog(log) { fs.appendFileSync(process.env.SUITE_BROWSER_LOG, JSON.stringify({hook:'console', content:log.content})+'\\n') }
    onTestRunEnd(modules, errors, reason) { fs.appendFileSync(process.env.SUITE_BROWSER_LOG, JSON.stringify({hook:'end', reason, errors:errors.map(error=>error.message), modules:modules.map(module=>({state:module.state(), errors:module.errors().length}))})+'\\n') }
  }\n`
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        include: ['suite.test.mjs'],
        maxWorkers: 1,
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
        mode,
        environment: 'browser',
        browser: {
          enabled: true,
          headless: true,
          instances: [{ browser: 'chromium' }],
        },
      },
    }) + '\n'
  )
  const reportPath = path.join(out, 'report.json')
  const logPath = path.join(out, 'console.jsonl')
  fs.writeFileSync(logPath, '')
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    SUITE_BROWSER_LOG: logPath,
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  let owner
  try {
    owner = await runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--reporter=' + path.join(fixture, 'reporter.mjs'),
        '--outputFile=' + reportPath,
      ],
      {
        cwd: fixture,
        env,
        auditDir: path.join(out, 'owners'),
        timeoutMs: 120000,
      }
    )
    fs.writeFileSync(path.join(out, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(out, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, `normal SuiteAPI Browser ${mode}/${group}`)
    assert.equal(owner.status, positive ? 0 : 1, owner.stdout + owner.stderr)
    const report = JSON.parse(fs.readFileSync(reportPath))
    assert.equal(report.success, positive)
    assert.equal(report.numTotalTests, positive ? 6 : 0)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numPassedTests, positive ? 6 : 0)
    const logs = fs
      .readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const terminal = logs.filter((row) => row.hook === 'end')
    assert.equal(terminal.length, 1)
    assert.equal(terminal[0].reason, positive ? 'passed' : 'failed')
    assert.deepEqual(terminal[0].errors, [])
    assert.deepEqual(terminal[0].modules, [
      { state: positive ? 'passed' : 'failed', errors: positive ? 0 : 1 },
    ])
    if (!positive) {
      const observations = logs
        .filter((row) => row.hook === 'console')
        .flatMap((row) => row.content.split('\n'))
        .filter((line) => line.startsWith('SUITE_API_BROWSER:'))
        .map((line) => JSON.parse(line.slice('SUITE_API_BROWSER:'.length)))
      assert.equal(observations.length, 1)
      if (group === 'load-failure')
        assert.deepEqual(observations[0], {
          stage: 'before original throw',
          callbacks: 0,
        })
      else
        assert.deepEqual(observations[0].trace, [
          'before explicit collect',
          'owned factory entered',
          'after explicit collect',
          'before original load throw',
          'owned factory resumed',
          ['owned rejected', true],
        ])
      assert.match(
        report.testResults[0].message,
        /Failed to import test file .*suite\.test\.mjs/
      )
    }
  } finally {
    if (
      owner &&
      !owner.timedOut &&
      owner.leakedProcesses.length === 0 &&
      owner.cleanupFailures.length === 0
    )
      fs.rmSync(fixture, { recursive: true, force: true })
  }
}
process.stdout.write(
  JSON.stringify({ allPassed: true, profiles: 2, cases: positive ? 12 : 0 }) +
    '\n'
)
