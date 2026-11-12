import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const files = [
  'suite.test.mjs',
  'subjects/empty.js',
  'subjects/full.js',
  'subjects/a-directory-name-long-enough-to-exercise-width/partial.js',
]

export async function verifyCoverageText(profile, { ansi = false } = {}) {
  const [consumerArg, outputArg] = process.argv.slice(2)
  assert(consumerArg && outputArg && profile)
  const consumer = resolve(consumerArg),
    output = resolve(outputArg),
    load = createRequire(join(consumer, 'package.json')),
    source = join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/coverage-text'
    ),
    fixture = fs.mkdtempSync(join(consumer, '.next-coverage-text-'))
  fs.mkdirSync(output, { recursive: true })
  let joined = false
  try {
    for (const name of files) {
      fs.mkdirSync(dirname(join(fixture, name)), { recursive: true })
      fs.copyFileSync(join(source, name + '.txt'), join(fixture, name))
    }
    fs.writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
    fs.writeFileSync(join(fixture, 'vitest.config.mjs'), profile.config)
    fs.writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const env = {
      ...process.env,
      CI: '1',
      NODE_ENV: profile.mode,
      FORCE_COLOR: ansi ? '1' : '0',
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
        '--reporter=json',
        '--outputFile=' + join(output, 'cases.json'),
      ],
      { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
    )
    fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'coverage text ' + profile.name)
    joined = true
    assert.equal(owner.status, 0, owner.stderr)
    const report = JSON.parse(fs.readFileSync(join(output, 'cases.json')))
    assert.equal(report.success, true)
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.numFailedTests, 0)
    const tests = report.testResults.flatMap((file) => file.assertionResults)
    assert.deepEqual(
      tests.map((test) => [test.fullName, test.status, test.failureMessages]),
      [['coverage text options', 'passed', []]]
    )
    const directory = join(fixture, 'coverage')
    assert.deepEqual(fs.readdirSync(directory).sort(), [
      'coverage-final.json',
      'coverage-summary.json',
      'lcov.info',
    ])
    const summary = JSON.parse(
      fs.readFileSync(join(directory, 'coverage-summary.json'))
    ).total
    for (const [metric, [total, covered, pct]] of Object.entries({
      statements: [4, 3, 75],
      branches: [2, 1, 50],
      functions: [1, 1, 100],
      lines: [3, 2, 66.66],
    }))
      assert.deepEqual(summary[metric], { total, covered, skipped: 0, pct })
    const coverage = JSON.parse(
      fs.readFileSync(join(directory, 'coverage-final.json'))
    )
    const coveredFiles = files.filter(
      (name) =>
        name.endsWith('.js') &&
        (profile.provider !== 'istanbul' || name !== 'subjects/empty.js')
    )
    assert.deepEqual(
      Object.keys(coverage)
        .map((name) => name.slice(fixture.length + 1))
        .sort(),
      coveredFiles.sort()
    )
    const lcov = fs.readFileSync(join(directory, 'lcov.info'), 'utf8')
    for (const name of coveredFiles) assert(lcov.includes('SF:' + name + '\n'))
    assert(lcov.includes('BRF:2\nBRH:1\n'))
    const lines = owner.stdout.split('\n'),
      plain = (line) => stripVTControlCharacters(line).trim(),
      start = lines.findIndex(
        (line) => /^[-|]+$/.test(plain(line)) && line.includes('|')
      ),
      end = lines.findIndex(
        (line, index) =>
          index > start + 2 && /^[-|]+$/.test(plain(line)) && line.includes('|')
      )
    assert(start >= 0 && end > start + 2, 'Missing coverage table')
    assert.equal(lines.slice(start, end + 1).join('\n') + '\n', profile.text)
    if (ansi) {
      const summaryStart = lines.findIndex((line) =>
          plain(line).includes('Coverage summary')
        ),
        summaryEnd = lines.findIndex(
          (line, index) => index > summaryStart && /^=+$/.test(plain(line))
        )
      assert(summaryStart >= 0 && summaryEnd > summaryStart)
      assert.equal(
        lines.slice(summaryStart - 1, summaryEnd + 1).join('\n') + '\n',
        profile.textSummary
      )
    }
    assert.equal(
      fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
      profile.config
    )
    for (const name of files)
      assert.equal(
        fs.readFileSync(join(fixture, name), 'utf8'),
        fs.readFileSync(join(source, name + '.txt'), 'utf8')
      )
    fs.writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          name: profile.name,
          provider: profile.provider,
          mode: profile.mode,
          casePassed: true,
          coverageTotalsVerified: true,
          exactTextVerified: true,
          configUnchanged: true,
          physicallyJoined: true,
        },
        null,
        2
      ) + '\n'
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
