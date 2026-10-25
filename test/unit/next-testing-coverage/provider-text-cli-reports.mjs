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
  readFileSync(join(here, 'fixtures/provider-text/pristine.json'))
)
const hash = (value) => createHash('sha256').update(value).digest('hex'),
  results = []
const canonical = (data) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([file, row]) => [
      file === 'total' ? file : basename(file),
      { ...row, ...('path' in row ? { path: basename(file) } : {}) },
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
for (const row of pristine.rows) {
  const destination = join(output, row.name),
    fixture = mkdtempSync(join(consumer, '.next-provider-text-'))
  mkdirSync(destination)
  try {
    for (const [name, source] of Object.entries(pristine.sourceFiles)) {
      assert.equal(hash(source.source), source.sha256)
      writeFileSync(join(fixture, name), source.source)
    }
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      CI: '1',
      FORCE_COLOR: '0',
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
    assertOwnedNodeCompleted(owner, 'Actual V8 provider/text CLI ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    const report = JSON.parse(readFileSync(join(destination, 'cases.json')))
    assert.deepEqual(
      cases(report),
      [...row.cases].sort((a, b) => a.file.localeCompare(b.file))
    )
    for (const key of [
      'success',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
    ])
      assert.equal(report[key], row.reportSummary[key])
    const directory = join(fixture, 'coverage'),
      files = [],
      assets = {}
    function scan(dir, prefix = '') {
      for (const name of readdirSync(dir)) {
        const file = join(dir, name),
          relative = prefix + name
        if (statSync(file).isDirectory()) scan(file, relative + '/')
        else {
          files.push(relative)
          if (/\.(?:css|js|png)$/.test(name))
            assets[relative] = hash(readFileSync(file))
        }
      }
    }
    if (existsSync(directory)) scan(directory)
    assert.deepEqual(files.sort(), row.reportFiles)
    assert.deepEqual(assets, row.staticHashes)
    for (const [name, expected] of [
      ['coverage-final.json', row.coverage],
      ['coverage-summary.json', row.summary],
    ]) {
      const file = join(directory, name),
        actual = existsSync(file)
          ? canonical(JSON.parse(readFileSync(file)))
          : null
      writeFileSync(
        join(destination, name),
        JSON.stringify(actual, null, 2) + '\n'
      )
      assert.deepEqual(actual, expected)
    }
    if (row.lcov !== null)
      assert.equal(readFileSync(join(directory, 'lcov.info'), 'utf8'), row.lcov)
    const lines = owner.stdout.split('\n'),
      start = lines.findIndex(
        (line) => line.startsWith('---') && line.includes('|')
      ),
      text = start < 0 ? null : lines.slice(start).join('\n').trim()
    assert.equal(text, row.coverageText)
    const result = {
      name: row.name,
      status: 'passed',
      wholeCasesEqual: true,
      completeCoverageOutputsEqual: true,
      reportManifestAndStaticAssetsEqual: true,
      exitCode: owner.status,
    }
    results.push(result)
    writeFileSync(
      join(destination, 'CHECKS.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    console.log(JSON.stringify(result))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(output, 'RESULTS.json'),
  JSON.stringify(
    { status: 'passed', profiles: results.length, results },
    null,
    2
  ) + '\n'
)
