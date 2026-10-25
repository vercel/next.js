import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
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
  pristine = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'fixtures/standard-reporters/pristine.json'
      )
    )
  ),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
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
function canonicalAsset(name, value, fixture) {
  if (!name.endsWith('.html') && !name.endsWith('.xml')) return value
  let text = value.toString('utf8')
  if (name === 'cobertura-coverage.xml') {
    assert.equal((text.match(/ timestamp="\d+"/g) ?? []).length, 1)
    text = text.replace(/ timestamp="\d+"/, ' timestamp="<TIMESTAMP>"')
    const source = `<source>${fixture}</source>`
    assert(text.includes(source))
    text = text.replace(source, '<source><PROJECT_ROOT></source>')
  } else if (name === 'index.html') {
    const pattern = /window.generatedDatetime = "[^"\n]+";/g
    assert.equal((text.match(pattern) ?? []).length, 1)
    text = text.replace(
      pattern,
      'window.generatedDatetime = "<GENERATED_DATETIME>";'
    )
  } else {
    const pattern = /at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g
    assert.equal((text.match(pattern) ?? []).length, 1)
    text = text.replace(pattern, 'at <GENERATED_DATETIME>')
  }
  return Buffer.from(text)
}
mkdirSync(output, { recursive: true })
for (const row of pristine.rows.filter(
  (row) => !selected || selected.includes(row.name)
)) {
  const destination = join(output, row.name),
    fixture = mkdtempSync(join(consumer, '.next-standard-reporters-')),
    directory = join(fixture, 'coverage')
  mkdirSync(destination)
  try {
    for (const [name, file] of Object.entries(pristine.sourceFiles)) {
      assert.equal(hash(file.source), file.sha256)
      writeFileSync(join(fixture, name), file.source)
    }
    writeFileSync(join(fixture, 'vitest.config.mjs'), row.originalConfigSource)
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    if (row.input.includes('clean-')) {
      mkdirSync(directory)
      writeFileSync(
        join(directory, 'prior-report.txt'),
        'previous actual report\n'
      )
    }
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
        ...(row.input === 'cli'
          ? [
              '--coverage',
              '--coverage.provider=v8',
              '--coverage.reporter=json',
              '--coverage.reporter=' + row.reporter,
            ]
          : []),
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
    assertOwnedNodeCompleted(owner, 'standard reporter ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    const report = JSON.parse(readFileSync(join(destination, 'cases.json')))
    assert.deepEqual(
      report.testResults
        .map((file) => ({
          file: basename(file.name),
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
    assert.equal(existsSync(directory), row.directoryExists)
    const files = []
    function collect(folder) {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        const file = join(folder, item.name)
        if (item.isDirectory()) collect(file)
        else files.push(relative(directory, file))
      }
    }
    if (existsSync(directory)) collect(directory)
    assert.deepEqual(files.sort(), row.files.map((file) => file.name).sort())
    const model = existsSync(join(directory, 'coverage-final.json'))
      ? Object.fromEntries(
          Object.entries(
            JSON.parse(readFileSync(join(directory, 'coverage-final.json')))
          ).map(([file, data]) => [
            basename(file),
            { ...data, path: basename(file) },
          ])
        )
      : null
    assert.deepEqual(model, row.coverage)
    for (const file of row.files) {
      const original = join(directory, file.name),
        target = join(destination, 'coverage', file.name)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(original, target)
      if (!file.coverageModel)
        assert.equal(
          hash(canonicalAsset(file.name, readFileSync(original), fixture)),
          file.sha256,
          file.name
        )
    }
    const marker =
        row.reporter === 'teamcity'
          ? '##teamcity['
          : row.reporter === 'text-lcov'
            ? 'TN:\n'
            : undefined,
      offset = marker ? owner.stdout.indexOf(marker) : -1,
      reportStdout = offset >= 0 ? owner.stdout.slice(offset).trim() : ''
    assert.equal(reportStdout, row.reportStdout)
    results.push({
      name: row.name,
      actualCaseProjectionEqual: true,
      completePublishedCoverageModelEqual: true,
      exactOutputManifestAndDirectoryPresenceEqual: true,
      actualReporterAssetsAndStdoutEqual: true,
      currentConfigBytesEqual: true,
      exitCode: owner.status,
    })
    console.log(JSON.stringify(results.at(-1)))
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
