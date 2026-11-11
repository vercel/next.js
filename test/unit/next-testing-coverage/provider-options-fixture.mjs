import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const fixtureFiles = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/provider-options'
)
export const subjects = ['subject.mjs', 'unimported.mjs', 'fully.mjs']
export const includeFlags = subjects.map((name) => '--coverage.include=' + name)
export const reporterFlags = ['json', 'json-summary', 'text', 'lcovonly'].map(
  (name) => '--coverage.reporter=' + name
)
export const standardCoverage = (enabled) => ({
  ...(enabled === undefined ? {} : { enabled }),
  provider: 'v8',
  include: subjects,
  exclude: [],
  reporter: ['json', 'json-summary', 'text', 'lcovonly'],
  reportsDirectory: 'configured-reports',
  clean: false,
  reportOnFailure: true,
})
export const customCoverage = (
  enabled,
  module = './deliberately-missing-provider.mjs'
) => ({
  enabled,
  provider: 'custom',
  customProviderModule: module,
  reportsDirectory: 'configured-reports',
  clean: false,
  reportOnFailure: true,
})
const htmlFiles = [
  'base.css',
  'block-navigation.js',
  'favicon.png',
  'fully.mjs.html',
  'index.html',
  'prettify.css',
  'prettify.js',
  'sort-arrow-sprite.png',
  'sorter.js',
  'subject.mjs.html',
  'unimported.mjs.html',
]
const outputFiles = {
  none: [],
  json: ['coverage-final.json'],
  full: ['coverage-final.json', 'coverage-summary.json', 'lcov.info'],
  default: [...htmlFiles, 'clover.xml', 'coverage-final.json'],
  'html-json': [...htmlFiles, 'coverage-final.json'],
  'clover-json': ['clover.xml', 'coverage-final.json'],
}
function filesIn(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name)
      if (entry.isDirectory()) visit(file)
      else files.push(relative(directory, file))
    }
  }
  visit(directory)
  return files.sort()
}
function assertCoverageCounters(file) {
  const data = JSON.parse(fs.readFileSync(file))
  const counters = Object.fromEntries(
    Object.entries(data).map(([name, row]) => [
      basename(name),
      { statements: row.s, functions: row.f, branches: row.b },
    ])
  )
  assert.deepEqual(counters, {
    'fully.mjs': { statements: { 0: 1 }, functions: { 0: 1 }, branches: {} },
    'subject.mjs': {
      statements: { 0: 1, 1: 1, 2: 0, 3: 0 },
      functions: { 0: 1, 1: 0 },
      branches: { 0: [1, 0] },
    },
    'unimported.mjs': {
      statements: { 0: 0, 1: 0, 2: 0, 3: 0 },
      functions: { 0: 0, 1: 0 },
      branches: { 0: [0, 0] },
    },
  })
}

export async function verifyCoverageOptions(
  profiles,
  { seedPreviousReport = false } = {}
) {
  const [consumerArg, outputArg] = process.argv.slice(2)
  assert(consumerArg && outputArg)
  const consumer = resolve(consumerArg)
  const output = resolve(outputArg)
  const load = createRequire(join(consumer, 'package.json'))
  const results = []
  fs.mkdirSync(output, { recursive: true })
  for (const profile of profiles) {
    const destination = join(output, profile.name)
    const fixture = fs.mkdtempSync(join(consumer, '.next-coverage-options-'))
    const directoryName =
      profile.directory ?? profile.coverage?.reportsDirectory ?? 'coverage'
    const directory = join(fixture, directoryName)
    fs.mkdirSync(destination)
    try {
      for (const file of fs.readdirSync(join(fixtureFiles, 'app'))) {
        fs.copyFileSync(
          join(fixtureFiles, 'app', file),
          join(fixture, file.replace(/\.txt$/, ''))
        )
      }
      fs.writeFileSync(
        join(fixture, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.writeFileSync(
        join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: consumer } }) +
          '\n'
      )
      const config =
        profile.coverage === undefined
          ? null
          : 'export default ' +
            JSON.stringify(
              {
                test: {
                  include: ['contract.test.mjs', 'full.test.mjs'],
                  coverage: profile.coverage,
                },
              },
              null,
              2
            ) +
            '\n'
      if (config !== null)
        fs.writeFileSync(join(fixture, 'vitest.config.mjs'), config)
      if (seedPreviousReport) {
        fs.mkdirSync(directory)
        fs.writeFileSync(
          join(directory, 'retained.txt'),
          'authored prior report\n'
        )
      }
      const env = {
        ...process.env,
        NODE_ENV: 'development',
        CI: '1',
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
      const reportPath = join(destination, 'cases.json')
      const owner = await runOwnedNode(
        [
          load.resolve('next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + reportPath,
          ...profile.flags,
        ],
        {
          cwd: fixture,
          env,
          auditDir: join(destination, 'owners'),
          timeoutMs: 120000,
        }
      )
      fs.writeFileSync(join(destination, 'stdout.log'), owner.stdout)
      fs.writeFileSync(join(destination, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(owner, 'coverage options ' + profile.name)
      assert.equal(
        owner.status,
        profile.exitCode ?? 0,
        owner.stdout + owner.stderr
      )
      const report = JSON.parse(fs.readFileSync(reportPath))
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 2)
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.numFailedTests, 0)
      assert.equal(report.numPendingTests, 0)
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      assert.deepEqual(
        cases.map((test) => [test.fullName, test.status]).sort(),
        [
          ['fully covered control', 'passed'],
          ['only true branch is executed', 'passed'],
        ]
      )
      assert(cases.every((test) => test.failureMessages.length === 0))
      const started = report.next.events.filter(
        (event) => event.type === 'file-start'
      )
      assert(started.length > 0)
      assert(
        started.every((event) => event.entry.profile.mode === 'development')
      )
      assert.equal(
        fs.existsSync(join(fixture, 'vitest.config.mjs'))
          ? fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8')
          : null,
        config
      )
      const expectedFiles = [...outputFiles[profile.outputs]]
      if (profile.retainPreviousReport) expectedFiles.push('retained.txt')
      assert.deepEqual(filesIn(directory), expectedFiles.sort())
      for (const other of ['coverage', 'configured-reports', 'cli-reports']) {
        if (other !== directoryName)
          assert(
            !fs.existsSync(join(fixture, other)),
            'Unexpected coverage directory: ' + other
          )
      }
      if (expectedFiles.includes('coverage-final.json'))
        assertCoverageCounters(join(directory, 'coverage-final.json'))
      if (expectedFiles.includes('coverage-summary.json')) {
        const summary = JSON.parse(
          fs.readFileSync(join(directory, 'coverage-summary.json'))
        ).total
        assert.deepEqual(
          ['lines', 'statements', 'functions', 'branches'].map((key) => [
            summary[key].covered,
            summary[key].total,
          ]),
          [
            [2, 7],
            [3, 9],
            [2, 5],
            [1, 4],
          ]
        )
      }
      if (expectedFiles.includes('lcov.info'))
        assert.equal(
          fs.readFileSync(join(directory, 'lcov.info'), 'utf8'),
          fs.readFileSync(join(fixtureFiles, 'lcov.info'), 'utf8')
        )
      for (const file of expectedFiles) {
        assert(
          fs.statSync(join(directory, file)).size > 0,
          'Empty report: ' + file
        )
        if (file.endsWith('.html'))
          assert.match(
            fs.readFileSync(join(directory, file), 'utf8'),
            /<!doctype html>|<html/i
          )
        if (file === 'clover.xml')
          assert.match(
            fs.readFileSync(join(directory, file), 'utf8'),
            /<coverage[\s>]/
          )
      }
      const lines = owner.stdout.split('\n')
      const start = lines.findIndex(
        (line) => line.startsWith('---') && line.includes('|')
      )
      if (profile.text) {
        assert(start >= 0, 'Missing coverage text report')
        assert.equal(
          lines.slice(start).join('\n').trim(),
          JSON.parse(
            fs.readFileSync(
              join(fixtureFiles, 'coverage-text.expected.json'),
              'utf8'
            )
          )
            .join('\n')
            .trim()
        )
      } else assert.equal(start, -1)
      if (profile.exitCode === 1)
        assert.match(
          owner.stdout + owner.stderr,
          /Coverage for lines.*threshold.*99/
        )
      assert(!fs.existsSync(join(fixture, 'provider-evaluated')))
      assert(!fs.existsSync(join(fixture, 'provider-trace.jsonl')))
      assert(!fs.existsSync(join(fixture, 'custom-coverage.json')))
      const check = {
        name: profile.name,
        status: 'passed',
        cases: 2,
        coverageSelectionChecked: true,
        reportDestinationsChecked: true,
        providerNotLoaded: true,
        configurationUnchanged: true,
      }
      results.push(check)
      fs.writeFileSync(
        join(destination, 'CHECKS.json'),
        JSON.stringify(check, null, 2) + '\n'
      )
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  fs.writeFileSync(
    join(output, 'RESULTS.json'),
    JSON.stringify(
      { status: 'passed', profiles: results.length, results },
      null,
      2
    ) + '\n'
  )
}
