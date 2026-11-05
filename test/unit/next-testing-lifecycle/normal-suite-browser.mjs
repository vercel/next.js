import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
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
const [consumerArg, outputArg, lane = 'source149', group = 'positive'] =
  process.argv.slice(2)
assert(['positive', 'load-failure', 'load-owned'].includes(group))
const positive = group === 'positive'
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const inputs = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'normal-suite-records/' + (positive ? 'browser' : 'browser-' + group)
)
const load = createRequire(consumer + '/package.json')
const next = path.dirname(load.resolve('next/package.json'))
const bin = load.resolve('next/dist/bin/next')
const browser = load('playwright')
const binary = browser.chromium.executablePath()
const browserVersion = load('playwright/package.json').version
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const pins = Object.fromEntries(
  [
    'package.json',
    'dist/bin/next',
    'dist/experimental/testing/runner/collector.js',
    'dist/experimental/testing/runner/index.js',
    'dist/experimental/testing/vitest.js',
  ].map((name) => [name, sha(fs.readFileSync(next + '/' + name))])
)
fs.mkdirSync(output)
const body = fs.readFileSync(resolveFixturePath(inputs + '/suite.test.mjs.txt'))
const reporter = `import fs from 'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(process.env.SUITE_BROWSER_LOG,JSON.stringify({hook:'console',log})+'\\n')}onTestRunEnd(modules,errors,reason){fs.appendFileSync(process.env.SUITE_BROWSER_LOG,JSON.stringify({hook:'end',reason,errors:errors.map(error=>({name:error.name,message:error.message})),modules:modules.map(module=>({state:module.state(),errors:module.errors()}))})+'\\n')}}\n`
function standard(report, authoredFile) {
  const { next, startTime, ...data } = report
  return {
    ...data,
    testResults: report.testResults.map(
      ({ startTime, endTime, name, assertionResults, message, ...file }) => ({
        ...file,
        message:
          message === `Failed to import test file ${authoredFile}`
            ? 'Failed to import test file suite.test.mjs'
            : message,
        name: path.basename(name),
        assertionResults: assertionResults.map(({ duration, ...test }) => test),
      })
    ),
  }
}
const rows = []
for (const mode of ['development', 'production']) {
  const out = output + '/' + mode
  fs.mkdirSync(out)
  const expected = JSON.parse(
    fs.readFileSync(
      resolveFixturePath(inputs + '/' + lane + '-' + mode + '-observed.json')
    )
  )
  const expectedReport = JSON.parse(
    fs.readFileSync(
      resolveFixturePath(inputs + '/' + lane + '-' + mode + '-report.json')
    )
  )
  const browserPin = JSON.parse(
    fs.readFileSync(
      resolveFixturePath(inputs + '/' + lane + '-' + mode + '-input.json')
    )
  )
  assert.equal(sha(fs.readFileSync(binary)), browserPin.executableSHA256)
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-normal-suite-browser-')
  )
  fs.symlinkSync(consumer + '/node_modules', fixture + '/node_modules', 'dir')
  fs.writeFileSync(
    fixture + '/package.json',
    JSON.stringify({
      type: 'module',
      private: true,
      dependencies: { playwright: browserVersion },
    }) + '\n'
  )
  fs.writeFileSync(fixture + '/suite.test.mjs', body)
  fs.writeFileSync(fixture + '/reporter.mjs', reporter)
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const test = {
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
  }
  fs.writeFileSync(
    fixture + '/next.test.config.json',
    JSON.stringify({ test }) + '\n'
  )
  fs.writeFileSync(out + '/console.jsonl', '')
  const reportPath = out + '/report.json'
  const args = [
    bin,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + fixture + '/reporter.mjs',
    '--outputFile=' + reportPath,
  ]
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    SUITE_BROWSER_LOG: out + '/console.jsonl',
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  save(out, 'INPUTS.json', {
    consumer,
    args,
    lane,
    mode,
    binary,
    binarySHA256: sha(fs.readFileSync(binary)),
    browserVersion,
    sourceSHA256: sha(body),
    test,
    productPins: pins,
    originalTimeoutMs: 120000,
    referenceTimeCoordinatesOnlyExcluded: true,
    filenameNormalization:
      'actual basename and only the exact known authored coordinate in the Browser import wrapper message',
  })
  let owner
  try {
    owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: out + '/owners',
      timeoutMs: 120000,
    })
    save(out, 'OWNER.json', owner)
    fs.writeFileSync(out + '/stdout.log', owner.stdout)
    fs.writeFileSync(out + '/stderr.log', owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'normal SuiteAPI Browser ' + lane + '/' + mode
    )
    assert.equal(owner.status, positive ? 0 : 1, owner.stdout + owner.stderr)
    const report = JSON.parse(fs.readFileSync(reportPath))
    const logs = fs
      .readFileSync(out + '/console.jsonl', 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const models = logs
      .filter((row) => row.hook === 'console')
      .flatMap((row) =>
        row.log.content
          .split('\n')
          .filter((text) => text.startsWith('SUITE_API_BROWSER:'))
          .map((text) => JSON.parse(text.slice('SUITE_API_BROWSER:'.length)))
      )
    assert.equal(models.length, 1)
    save(out, 'OBSERVED.json', models[0])
    assert.deepEqual(models[0], expected)
    save(
      out,
      'STANDARD-NEXT.json',
      standard(report, fixture + '/suite.test.mjs')
    )
    save(
      out,
      'STANDARD-GENUINE.json',
      standard(expectedReport, expectedReport.testResults[0].name)
    )
    save(out, 'NEXT-ENVELOPE.json', report.next)
    assert.equal(report.next.version, 1)
    assert.deepEqual(
      standard(report, fixture + '/suite.test.mjs'),
      standard(expectedReport, expectedReport.testResults[0].name)
    )
    const terminal = logs.filter((row) => row.hook === 'end')
    assert.equal(terminal.length, 1)
    assert.equal(terminal[0].reason, positive ? 'passed' : 'failed')
    assert.deepEqual(terminal[0].errors, [])
    assert(
      terminal[0].modules.every(
        (module) =>
          module.state === (positive ? 'passed' : 'failed') &&
          module.errors.length === (positive ? 0 : 1)
      )
    )
    rows.push({
      lane,
      mode,
      cases: positive ? 6 : 0,
      completeObservedModelEqual: true,
      allStandardReferenceFieldsEqual: true,
      realTerminalAndPhysicalOwnersJoined: true,
    })
  } finally {
    if (
      owner &&
      !owner.timedOut &&
      owner.leakedProcesses.length === 0 &&
      owner.cleanupFailures.length === 0
    )
      fs.rmSync(fixture, { recursive: true, force: true })
    save(out, 'CLOSED.json', {
      ownerRetained: !!owner,
      fixtureRetired: !fs.existsSync(fixture),
    })
  }
  for (const [name, pin] of Object.entries(pins))
    assert.equal(sha(fs.readFileSync(next + '/' + name)), pin)
}
save(output, 'CHECKS.json', {
  allPassed: true,
  profiles: rows,
  actualCases: positive ? 12 : 0,
  noOtherEngineOrPlatformClaim: true,
})
process.stdout.write(
  JSON.stringify({ allPassed: true, profiles: 2, cases: positive ? 12 : 0 }) +
    '\n'
)
