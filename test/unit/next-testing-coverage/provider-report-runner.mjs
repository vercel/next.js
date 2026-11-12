import {
  assertCoverageCounters,
  assertCoverageReports,
} from './settled-coverage-assertions.mjs'
import { readCoverageFixture } from './coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  cpSync,
} from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const families = {
  setup: ['setup', 'istanbul-setup', 'setup/serializer'],
  cjs: ['cjs', 'istanbul-cjs', 'CommonJS'],
  beforeall: ['beforeall', 'istanbul-beforeall', 'beforeAll'],
  beforeeach: ['beforeeach', 'istanbul-beforeeach', 'beforeEach'],
  'beforeeach-array': ['beforeeach-array', 'istanbul-beforeeach', 'beforeEach'],
  v8: ['v8-harness', 'v8-harness', 'setup/serializer'],
  workers: ['workers', 'istanbul-workers', 'file workers'],
  loaded: ['loaded', 'istanbul-loaded', 'loaded-source'],
}

async function withProviderFixture(kind, verify) {
  const [consumerArg, outputArg, profile] = process.argv.slice(2)
  assert(consumerArg && outputArg && profile)
  const consumer = resolve(consumerArg),
    output = resolve(outputArg),
    source = process.argv.includes('--source'),
    load = createRequire(join(consumer, 'package.json')),
    [file, prefix, description] = families[kind]
  if (!source)
    for (const name of ['vitest', 'vite', '@vitest/mocker'])
      assert.throws(() => load.resolve(name))
  const pristine = readCoverageFixture(
      join(here, 'fixtures/istanbul-provider', file + '-pristine.json')
    ),
    row = pristine.rows.find((value) => value.name === profile)
  if (kind === 'workers') assert(row)
  else if (kind === 'loaded')
    assert(row && !Object.hasOwn(pristine.unqualifiedProfiles, profile))
  else assert(row, 'Missing genuine ' + description + ' profile')
  const fixture = mkdtempSync(join(consumer, '.next-' + prefix + '-'))
  mkdirSync(output, { recursive: true })
  try {
    for (const [name, file] of Object.entries(row.sourceFiles)) {
      assert.equal(hash(file.source), file.sha256)
      writeFileSync(join(fixture, name), file.source)
    }
    writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    if (row.snapshots && Object.keys(row.snapshots).length) {
      mkdirSync(join(fixture, '__snapshots__'))
      for (const [name, contents] of Object.entries(row.snapshots))
        writeFileSync(join(fixture, '__snapshots__', name), contents)
    }
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
      ],
      { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
    )
    writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(output, 'stdout.log'), owner.stdout)
    writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      (kind === 'v8'
        ? 'V8 '
        : kind === 'loaded' || kind === 'workers'
          ? 'Actual Istanbul '
          : 'Istanbul ') +
        description +
        ' ' +
        profile
    )
    assert.equal(
      owner.status,
      kind === 'loaded' || kind === 'workers' ? 0 : row.exitCode,
      owner.stderr
    )
    const report = JSON.parse(readFileSync(join(output, 'cases.json')))
    await verify({ row, profile, fixture, output, report })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({ fixtureRetired: !existsSync(fixture) }) + '\n'
    )
  }
}

export async function runSettledProviderReport(kind) {
  await withProviderFixture(
    kind,
    ({ row, profile, fixture, output, report }) => {
      const beforeEach = kind.startsWith('beforeeach'),
        keys = [
          'ancestorTitles',
          'fullName',
          'status',
          'title',
          'failureMessages',
        ],
        errorMessage = (value) =>
          beforeEach
            ? value.split(/\n(?: {4}at | ❯ )/u)[0]
            : value.split('\n')[0],
        cases = (report) =>
          report.testResults.map((file) => ({
            file: basename(file.name),
            status: file.status,
            message: file.message,
            cases: file.assertionResults.map((value) =>
              Object.fromEntries(
                keys
                  .filter((key) => key in value)
                  .map((key) => [
                    key,
                    key === 'failureMessages'
                      ? value[key].map(errorMessage)
                      : value[key],
                  ])
              )
            ),
          }))
      assert.deepEqual(cases(report), cases(row.cases))
      if (kind === 'v8') {
        assertCoverageCounters(report.coverageMap, fixture, row.coverage)
        assert.deepEqual(report.snapshot, row.cases.snapshot)
      }
      if (beforeEach) {
        const frames = []
        for (const [
          index,
          actual,
        ] of report.testResults[0].assertionResults.entries()) {
          const expected = row.cases.testResults[0].assertionResults[index]
          assert.equal(
            actual.failureMessages.length,
            expected.failureMessages.length
          )
          for (let i = 0; i < actual.failureMessages.length; i++) {
            const actualFrame = /setup\.mjs:(\d+):(\d+)/u.exec(
                actual.failureMessages[i]
              ),
              expectedLine = row.setupErrorLines[index][i]
            assert(actualFrame, 'actual authored setup frame required')
            assert.equal(Number(actualFrame[1]), expectedLine)
            frames.push({
              actual: actualFrame[0],
              expectedSetupLine: expectedLine,
            })
          }
        }
        writeFileSync(
          join(output, 'RAW-FRAME-DIFFERENCES.json'),
          JSON.stringify(
            { frames, rawFrameEqualityQualified: false },
            null,
            2
          ) + '\n'
        )
      }
      for (const key of [
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
        'numTodoTests',
        'success',
      ])
        assert.deepEqual(report[key], row.cases[key], key)
      const coverage = join(fixture, 'coverage')
      assert.deepEqual(
        ((kind === 'beforeall' || beforeEach) && !existsSync(coverage)
          ? []
          : readdirSync(coverage)
        ).sort(),
        row.reportFiles.slice().sort()
      )
      mkdirSync(join(output, 'coverage'))
      if (row.reportFiles.length) {
        assertCoverageReports(coverage, fixture, row.coverage, row.reportFiles)
        for (const name of row.reportFiles)
          copyFileSync(join(coverage, name), join(output, 'coverage', name))
      }
      const snapshots = existsSync(join(fixture, '__snapshots__'))
        ? Object.fromEntries(
            readdirSync(join(fixture, '__snapshots__')).map((name) => [
              name,
              readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
            ])
          )
        : {}
      assert.deepEqual(snapshots, row.snapshots)
      assert.equal(
        readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
        row.config
      )
      writeFileSync(
        join(output, 'SNAPSHOTS.json'),
        JSON.stringify(snapshots, null, 2) + '\n'
      )
      const extra =
        kind === 'cjs'
          ? {
              namedImport: row.named,
              nestedRequire: row.nested,
              explicit: row.explicit,
              authoredCaseFailure: row.fail,
            }
          : kind === 'beforeall'
            ? {
                actualSettledBeforeAllFailure: true,
                reportOnFailure: !profile.endsWith('-report-false'),
              }
            : beforeEach
              ? {
                  actualSettledBeforeEachFailure: true,
                  reportOnFailure: !profile.endsWith('-report-false'),
                }
              : {
                  setup: row.setup,
                  serializer: row.serializer,
                  explicit: row.explicit,
                  authoredCaseFailure: row.fail,
                }
      writeFileSync(
        join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            actualPublicCLI: true,
            profile,
            ...extra,
            caseStatusesAndErrors: true,
            ...(beforeEach
              ? {
                  authoredErrorHeadings: true,
                  authoredFileAndLine: true,
                  rawFrameEqualityQualified: false,
                }
              : {}),
            ...(kind === 'v8' ? { actualJSONCoverageCounters: true } : {}),
            coverageCountersAndReportFiles: true,
            exactExistingSnapshots: true,
            configUnchanged: true,
            allOwnersJoined: true,
          },
          null,
          2
        ) + '\n'
      )
    }
  )
}

export async function runLoadedProviderReport(kind) {
  await withProviderFixture(
    kind,
    ({ row, profile, fixture, output, report }) => {
      cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
        recursive: true,
      })
      for (const name of ['coverage-final.json', 'coverage-summary.json']) {
        const raw = JSON.parse(readFileSync(join(fixture, 'coverage', name))),
          actual = Object.fromEntries(
            Object.entries(raw).map(([file, data]) => [
              file === 'total' ? file : basename(file),
              {
                ...data,
                ...('path' in data ? { path: basename(data.path) } : {}),
              },
            ])
          )
        assert.deepEqual(actual, row.reports[name])
      }
      assert.equal(
        readFileSync(join(fixture, 'coverage/lcov.info'), 'utf8'),
        row.reports['lcov.info']
      )
      assert.deepEqual(
        report.testResults
          .map((file) => ({
            file: basename(file.name),
            status: file.status,
            message: file.message,
            cases: file.assertionResults.map(({ duration, ...test }) => test),
          }))
          .sort((a, b) => a.file.localeCompare(b.file)),
        row.cases
      )
      if (row.actualParallelBarrier)
        for (const name of ['a', 'b'])
          assert.equal(
            readFileSync(join(fixture, 'ready-' + name), 'utf8'),
            'entered'
          )
      for (const [name, file] of Object.entries(row.sourceFiles))
        assert.equal(hash(readFileSync(join(fixture, name))), file.sha256)
      writeFileSync(
        join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            profile,
            completeCasesAndReports: true,
            ...(kind === 'loaded' ? { actualLoadedSourcesOnly: true } : {}),
            actualParallelBarrier: row.actualParallelBarrier,
            defaultConfigurationReportEquality: true,
            allOwnersClosed: true,
          },
          null,
          2
        ) + '\n'
      )
    }
  )
}
