import { assertCoverageCounters } from './snapshot-coverage-assertions.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs'
import { join, dirname, basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  source = process.argv.includes('--source'),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && profile)
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const pristine = JSON.parse(
    readFileSync(join(here, 'fixtures/istanbul-provider/public-pristine.json'))
  ),
  row = pristine.rows.find((row) => row.name === profile)
assert(
  row && !Object.hasOwn(pristine.unqualifiedProfiles, profile),
  'Profile still requires its recorded implementation increment'
)
const fixture = mkdtempSync(join(consumer, '.next-istanbul-public-'))
const keys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
]
mkdirSync(output, { recursive: true })
try {
  for (const [name, source] of Object.entries(pristine.sourceFiles))
    writeFileSync(join(fixture, name), source)
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.before)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, 'coverage'))
  writeFileSync(
    join(fixture, 'coverage/retained-sentinel.txt'),
    'original report bytes\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const disabled = [
    'configured-disabled',
    'disabled-provider-only',
    'enabled-coverage-false',
    'false-before-provider',
    'provider-before-false',
    'no-config-provider-only',
    'threshold-auto-update-disabled',
    'disabled-clean-true',
    'disabled-clean-false',
  ].includes(profile)
  const guardTrace = join(output, 'instrumentation-import-attempts.txt')
  if (disabled) {
    const guard = join(output, 'disabled-instrumentation-guard.cjs')
    writeFileSync(
      guard,
      `const Module=require('node:module'),fs=require('node:fs');const original=Module._load;Module._load=function(name,...args){if(String(name).includes('next-test-instrumentation')){fs.appendFileSync(${JSON.stringify(guardTrace)},String(process.pid)+'\\n');throw new Error('Disabled coverage loaded Istanbul instrumentation.')}return Reflect.apply(original,this,[name,...args])}\n`
    )
    env.NODE_OPTIONS = '--require=' + JSON.stringify(guard)
  }
  const owner = await runOwnedNode(
    [
      source
        ? join(consumer, 'packages/next/dist/bin/next')
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
      ...row.flags,
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Actual public Istanbul ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  if (disabled)
    assert(
      !existsSync(guardTrace),
      'Disabled provider imported the instrumentation dependency'
    )
  const result = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.deepEqual(
    result.testResults
      .map((file) => ({
        file: basename(file.name),
        status: file.status,
        message: file.message,
        cases: file.assertionResults.map((test) =>
          Object.fromEntries(
            keys
              .filter((key) => key in test)
              .map((key) => [
                key,
                key === 'failureMessages'
                  ? test[key].map((message) => message.split('\n')[0])
                  : test[key],
              ])
          )
        ),
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    row.cases
  )
  assert.equal(
    readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.after
  )
  assert.equal(existsSync(join(fixture, 'coverage')), row.directoryExists)
  const files = []
  function scan(directory) {
    if (!existsSync(directory)) return
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, item.name)
      if (item.isDirectory()) scan(file)
      else {
        const name = relative(join(fixture, 'coverage'), file)
        files.push(name)
        mkdirSync(dirname(join(output, 'coverage', name)), { recursive: true })
        copyFileSync(file, join(output, 'coverage', name))
      }
    }
  }
  scan(join(fixture, 'coverage'))
  assert.deepEqual(files.sort(), row.files.slice().sort())
  for (const name of row.files) {
    const bytes = readFileSync(join(fixture, 'coverage', name))
    if (name === 'coverage-final.json')
      assertCoverageCounters(JSON.parse(bytes), fixture, row.coverage)
    else if (name === 'coverage-summary.json') {
      const summary = JSON.parse(bytes)
      assert.deepEqual(
        Object.keys(summary)
          .map((name) => basename(name))
          .sort(),
        row.summary.files
      )
      assert.deepEqual(summary.total, row.summary.total)
    } else if (name === 'retained-sentinel.txt')
      assert.equal(bytes.toString(), 'original report bytes\n')
    else if (name === 'lcov.info') {
      if (Object.keys(row.coverage ?? {}).length)
        assert.match(bytes.toString(), /^SF:/m)
      else assert.equal(bytes.length, 0)
    } else if (name.endsWith('.html'))
      assert.match(bytes.toString(), /<!doctype html>|<html/i)
    else if (name.endsWith('.xml')) assert.match(bytes.toString(), /<\?xml/)
    else if (name.endsWith('.png'))
      assert.deepEqual(
        [...bytes.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10]
      )
    else
      assert(bytes.length > 0, 'Static report asset must not be empty: ' + name)
  }
  const lines = owner.stdout.split('\n'),
    offset = lines.findIndex(
      (line) => line.startsWith('---') && line.includes('|')
    )
  assert.equal(
    offset < 0 ? null : lines.slice(offset).join('\n').trim(),
    row.coverageText
  )
  assert.deepEqual(
    owner.stderr
      .split('\n')
      .filter((line) => /Coverage for |Uncovered .* exceed /.test(line))
      .map((line) => line.replace(/^ERROR: /, '')),
    row.thresholdErrors
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualPublicCLI: true,
        caseOutcomes: true,
        coverageHitsSummariesAndAssetFormats: true,
        actualThresholdsAndConfigBytes: true,
        disabledInstrumentationAbsent: disabled,
        ownedProcessTreeClosed: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({ fixtureRetired: !existsSync(fixture) }) + '\n'
  )
}
