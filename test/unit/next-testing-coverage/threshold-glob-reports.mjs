import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { join, basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [rootArg, destinationArg, mode = 'development'] = process.argv.slice(2)
assert(
  rootArg && destinationArg,
  'Expected an existing source checkout/consumer and fresh output path'
)
const repo = resolve(rootArg),
  out = resolve(destinationArg),
  here = dirname(fileURLToPath(import.meta.url)),
  require = createRequire(join(repo, 'package.json')),
  bin = require.resolve('next/dist/bin/next'),
  pristine = JSON.parse(
    readFileSync(join(here, 'fixtures/threshold-globs/pristine.json'))
  ),
  refs = pristine.rows.map((row) => ({ ...row, ...pristine.report })),
  canonical = (data) =>
    Object.fromEntries(
      Object.entries(data).map(([file, row]) => [
        file === 'total' ? 'total' : basename(file),
        file === 'total'
          ? row
          : { ...row, ...('path' in row ? { path: basename(row.path) } : {}) },
      ])
    ),
  results = []
assert(pristine.modes.includes(mode))
if (process.argv.includes('--installed'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
mkdirSync(out)
const keys = [
    'ancestorTitles',
    'fullName',
    'status',
    'title',
    'failureMessages',
    'meta',
    'tags',
    'benchmarks',
  ],
  expectedCases = pristine.cases
for (const row of pristine.rows) {
  const destination = join(out, row.name)
  mkdirSync(destination)
  const fixture = mkdtempSync(join(repo, '.threshold-glob-cli-'))
  try {
    for (const [name, desc] of Object.entries(pristine.sourceFiles)) {
      writeFileSync(join(fixture, name), desc.source)
      assert.equal(
        createHash('sha256')
          .update(readFileSync(join(fixture, name)))
          .digest('hex'),
        desc.sha256
      )
    }
    writeFileSync(
      join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          mode,
          include: ['contract.case.mjs'],
          coverage: {
            provider: 'v8',
            enabled: true,
            include: ['subject.mjs', 'unimported.mjs'],
            exclude: [],
            reporter: ['json', 'json-summary', 'text', 'lcovonly'],
            reportsDirectory: 'coverage',
            thresholds: row.thresholds,
          },
        },
      }) + '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      CI: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const command = [
        bin,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=result.json',
      ],
      owner = await runOwnedNode(command, {
        cwd: fixture,
        env,
        auditDir: join(destination, 'owners'),
        timeoutMs: 60000,
      })
    writeFileSync(
      join(destination, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(destination, 'stdout.log'), owner.stdout)
    writeFileSync(join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    const result = JSON.parse(readFileSync(join(fixture, 'result.json'))),
      cases = result.testResults.flatMap((file) =>
        file.assertionResults.map((test) =>
          Object.fromEntries(
            keys.filter((key) => key in test).map((key) => [key, test[key]])
          )
        )
      )
    writeFileSync(
      join(destination, 'result.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    assert.deepEqual(cases, expectedCases)
    for (const name of ['coverage-summary.json', 'lcov.info'])
      writeFileSync(
        join(destination, name),
        readFileSync(join(fixture, 'coverage', name))
      )
    const actual = canonical(
      JSON.parse(readFileSync(join(fixture, 'coverage/coverage-final.json')))
    )
    writeFileSync(
      join(destination, 'actual-coverage.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    assert.deepEqual(actual, pristine.coverage)
    const reference = refs.find((ref) => ref.name === row.name)
    assert.deepEqual(
      canonical(
        JSON.parse(
          readFileSync(join(fixture, 'coverage/coverage-summary.json'))
        )
      ),
      canonical(reference.summary)
    )
    assert.equal(
      readFileSync(join(fixture, 'coverage/lcov.info'), 'utf8'),
      reference.lcov
    )
    assert.equal(
      owner.stdout.slice(owner.stdout.search(/^-{3,}\|/m)).trim(),
      reference.text
    )
    const errors = owner.stderr
      .split('\n')
      .filter(
        (line) => line.startsWith('ERROR: ') && line.includes('threshold')
      )
    assert.deepEqual(errors, row.cliThresholdDiagnostics)
    for (const [name, desc] of Object.entries(pristine.sourceFiles))
      assert.equal(
        createHash('sha256')
          .update(readFileSync(join(fixture, name)))
          .digest('hex'),
        desc.sha256
      )
    results.push({
      name: row.name,
      exitCode: owner.status,
      cases: cases.length,
      completeReports: 1,
      fullFileModels: Object.keys(actual).length,
      exactThresholdDiagnostics: true,
    })
    writeFileSync(
      join(out, 'RESULTS.json'),
      JSON.stringify({ status: 'in progress', results }, null, 2) + '\n'
    )
    console.log(JSON.stringify(results.at(-1)))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(out, 'RESULTS.json'),
  JSON.stringify(
    {
      status: 'passed',
      mode,
      node: process.version,
      profiles: results.length,
      cases: results.reduce((n, r) => n + r.cases, 0),
      completeReports: results.length,
      fullFileModels: results.reduce((n, r) => n + r.fullFileModels, 0),
      results,
    },
    null,
    2
  ) + '\n'
)
