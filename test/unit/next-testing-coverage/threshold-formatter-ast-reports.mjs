import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  require = createRequire(join(consumer, 'package.json')),
  here = dirname(fileURLToPath(import.meta.url)),
  pristine = JSON.parse(
    readFileSync(join(here, 'fixtures/formatter-ast/pristine.json'))
  ),
  selected = process.argv
    .find((argument) => argument.startsWith('--profiles='))
    ?.slice('--profiles='.length)
    .split(','),
  results = []
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
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
mkdirSync(output, { recursive: true })
for (const row of pristine.rows.filter(
  (row) => !selected || selected.includes(row.name)
)) {
  const destination = join(output, row.name),
    fixture = mkdtempSync(join(consumer, '.next-formatter-current-ast-')),
    configFile = join(fixture, 'vitest.config.mjs'),
    trace = join(destination, 'trace.jsonl')
  mkdirSync(destination)
  try {
    for (const [name, file] of Object.entries(pristine.sourceFiles)) {
      assert.equal(
        createHash('sha256').update(file.source).digest('hex'),
        file.sha256
      )
      writeFileSync(join(fixture, name), file.source)
    }
    writeFileSync(join(fixture, 'edit.test.mjs'), pristine.editSource)
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const before = row.before.replaceAll(
      '<TRACE_DIR>/' + row.name + '/trace.jsonl',
      trace
    )
    writeFileSync(configFile, before)
    writeFileSync(join(destination, 'before.mjs'), before)
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      CI: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      FORMATTER_EDIT_SOURCE: row.profile.edit ?? '',
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
    assertOwnedNodeCompleted(owner, 'formatter current AST ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    assert(owner.stderr.includes(row.error.message), owner.stderr)
    const report = JSON.parse(readFileSync(join(destination, 'cases.json'))),
      starts = report.next.events.filter((event) => event.type === 'file-start')
    assert(starts.length > 0)
    assert(starts.every((event) => event.entry.profile.mode === 'development'))
    assert.deepEqual(
      report.testResults
        .map((file) => ({
          file: basename(file.name),
          cases: file.assertionResults.map((test) =>
            Object.fromEntries(
              keys.filter((key) => key in test).map((key) => [key, test[key]])
            )
          ),
        }))
        .sort((a, b) => a.file.localeCompare(b.file)),
      row.cases
    )
    const after = readFileSync(configFile, 'utf8')
    writeFileSync(join(destination, 'after.mjs'), after)
    assert.equal(
      after,
      row.after.replaceAll('<TRACE_DIR>/' + row.name + '/trace.jsonl', trace)
    )
    assert.deepEqual(
      existsSync(trace)
        ? readFileSync(trace, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        : [],
      row.calls
    )
    const actual = JSON.parse(
        readFileSync(join(fixture, 'coverage/coverage-final.json'))
      ),
      portable = Object.fromEntries(
        Object.entries(actual).map(([file, data]) => [
          basename(file),
          { ...data, path: basename(file) },
        ])
      )
    writeFileSync(
      join(destination, 'coverage-final.json'),
      JSON.stringify(portable, null, 2) + '\n'
    )
    assert.deepEqual(portable, row.coverage)
    results.push({
      name: row.name,
      completeCaseRowsEqual: true,
      completeCoverageModelsEqual: true,
      currentConfigBytesEqual: true,
      actualFormatterCallsEqual: true,
      actualDiagnosticMessageEqual: true,
      exitCode: owner.status,
    })
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
