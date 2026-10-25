import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  require = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
const pristine = JSON.parse(
    readFileSync(join(here, 'fixtures/coverage-enable/pristine.json'))
  ),
  hash = (v) => createHash('sha256').update(v).digest('hex'),
  results = []
const canonical = (data) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([name, row]) => [
      name === 'total' ? name : basename(name),
      { ...row, ...('path' in row ? { path: basename(name) } : {}) },
    ])
  )
const keys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
  'meta',
  'tags',
  'benchmarks',
]
const cases = (result) =>
  result.testResults
    .map((file) => ({
      file: basename(file.name),
      cases: file.assertionResults.map((test) =>
        Object.fromEntries(
          keys.filter((key) => key in test).map((key) => [key, test[key]])
        )
      ),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
mkdirSync(output, { recursive: true })
for (const row of pristine.rows.filter(
  (row) => !pristine.unqualifiedLegacyProfiles.includes(row.name)
)) {
  const destination = join(output, row.name),
    fixture = mkdtempSync(join(consumer, '.next-coverage-enable-'))
  mkdirSync(destination)
  try {
    for (const [name, file] of Object.entries(pristine.sourceFiles)) {
      assert.equal(hash(file.source), file.sha256)
      writeFileSync(join(fixture, name), file.source)
    }
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    if (row.before !== null)
      writeFileSync(join(fixture, 'vitest.config.mjs'), row.before)
    const reportsName =
        row.profile.directory ??
        row.profile.coverage?.reportsDirectory ??
        'coverage',
      reports = join(fixture, reportsName)
    mkdirSync(reports)
    writeFileSync(join(reports, 'retained.txt'), 'authored prior report\n')
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      CI: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    }
    for (const name of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[name]
    const owner = await runOwnedNode(
      [
        require.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + join(destination, 'cases.json'),
        ...row.profile.flags,
      ],
      {
        cwd: fixture,
        env,
        auditDir: join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    writeFileSync(
      join(destination, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(destination, 'stdout.log'), owner.stdout)
    writeFileSync(join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'actual dotted coverage activation ' + row.name
    )
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    const result = JSON.parse(readFileSync(join(destination, 'cases.json')))
    assert.deepEqual(
      cases(result),
      [...row.cases].sort((a, b) => a.file.localeCompare(b.file))
    )
    for (const key of [
      'success',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
    ])
      assert.equal(result[key], row.reportSummary[key])
    const started = result.next.events.filter(
      (event) => event.type === 'file-start'
    )
    assert(started.length > 0)
    assert(started.every((event) => event.entry.profile.mode === 'development'))
    const after = existsSync(join(fixture, 'vitest.config.mjs'))
      ? readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8')
      : null
    assert.equal(after, row.after)
    const directories = {}
    for (const name of ['configured-reports', 'cli-reports', 'coverage']) {
      const path = join(fixture, name),
        files = []
      function scan(dir, prefix = '') {
        for (const name of readdirSync(dir)) {
          const file = join(dir, name)
          if (statSync(file).isDirectory()) scan(file, prefix + name + '/')
          else files.push(prefix + name)
        }
      }
      if (existsSync(path)) scan(path)
      directories[name] = files.sort()
      if (name === reportsName) assert.deepEqual(files, row.reportFiles)
      else
        assert(
          !existsSync(path),
          'Unexpected coverage output directory ' + name
        )
    }
    writeFileSync(
      join(destination, 'actual-output-directories.json'),
      JSON.stringify(directories, null, 2) + '\n'
    )
    for (const [name, expected] of [
      ['coverage-final.json', row.coverage],
      ['coverage-summary.json', row.summary],
    ]) {
      const path = join(reports, name),
        actual = existsSync(path)
          ? canonical(JSON.parse(readFileSync(path)))
          : null
      writeFileSync(
        join(destination, name),
        JSON.stringify(actual, null, 2) + '\n'
      )
      assert.deepEqual(actual, expected)
    }
    const lcov = existsSync(join(reports, 'lcov.info'))
      ? readFileSync(join(reports, 'lcov.info'), 'utf8')
      : null
    assert.equal(lcov, row.lcov)
    const lines = owner.stdout.split('\n'),
      start = lines.findIndex(
        (line) => line.startsWith('---') && line.includes('|')
      ),
      text = start < 0 ? null : lines.slice(start).join('\n').trim()
    assert.equal(text, row.coverageText)
    const trace = existsSync(join(fixture, 'provider-trace.jsonl'))
      ? readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
      : null
    assert.equal(trace, row.customTrace)
    assert(!existsSync(join(fixture, 'custom-coverage.json')))
    for (const [name, file] of Object.entries(pristine.sourceFiles))
      assert.equal(hash(readFileSync(join(fixture, name))), file.sha256)
    const check = {
      name: row.name,
      status: 'passed',
      wholeCasesAndReportsEqual: true,
      rawConfigurationUnchanged: true,
      noCustomProviderHooksOrOutputs: true,
      allOutputDirectoriesValidated: true,
      actualDevelopmentMode: true,
      exitCode: owner.status,
    }
    results.push(check)
    writeFileSync(
      join(destination, 'CHECKS.json'),
      JSON.stringify(check, null, 2) + '\n'
    )
    console.log(JSON.stringify(check))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(output, 'RESULTS.json'),
  JSON.stringify(
    {
      status: 'passed',
      profiles: results.length,
      results,
      unqualifiedLegacyProfiles: pristine.unqualifiedLegacyProfiles,
    },
    null,
    2
  ) + '\n'
)
