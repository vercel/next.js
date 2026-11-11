import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = path.join(here, 'fixtures/shared-rsc')
export function readSharedRscSources() {
  const directory = path.join(corpus, 'sources')
  return Object.fromEntries(
    fixtureFiles(directory).map((file) => [
      file.replace(/\.txt$/, ''),
      fs.readFileSync(resolveFixturePath(path.join(directory, file))),
    ])
  )
}
export async function runSharedRsc(
  consumer,
  output,
  repository = path.resolve(here, '../../..'),
  kind = 'source'
) {
  consumer = path.resolve(consumer)
  output = path.resolve(output)
  repository = path.resolve(repository)
  assert(['source', 'installed'].includes(kind))
  assert(!fs.existsSync(output))
  fs.mkdirSync(output, { recursive: true })
  const sources = readSharedRscSources()
  const load = createRequire(path.join(consumer, 'package.json'))
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repository,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const fixture = fs.mkdtempSync(path.join(consumer, '.next-test-shared-rsc-'))
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + '\n'
    )
  for (const [file, bytes] of Object.entries(sources)) {
    const target = path.join(fixture, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  const nextConfig = {
    cacheComponents: false,
    turbopack: { root: consumer },
    experimental: { turbopackSharedRuntime: true },
  }
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify(nextConfig) + '\n'
  )
  const testConfig = {
    test: {
      fileParallelism: false,
      maxWorkers: 1,
      sequence: { seed: 1, shuffle: false },
      projects: [
        {
          name: 'shared-rsc',
          environment: 'rsc',
          mode: 'development',
          route: '/shared/[id]',
          isolate: false,
          include: ['first.case.mjs', 'second.case.mjs'],
          testTimeout: 10000,
          hookTimeout: 10000,
        },
      ],
    },
  }
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify(testConfig) + '\n'
  )
  const args = [
    load.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter',
    'default',
    'json',
    '--outputFile',
    path.join(output, 'report.raw.json'),
  ]
  const env = Object.fromEntries(
    ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]])
  )
  Object.assign(env, {
    NODE_ENV: 'development',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    GIT_OPTIONAL_LOCKS: '0',
    FORCE_COLOR: '0',
  })
  let joined = false,
    complete = false
  try {
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 120000,
    })
    save('OWNER.json', result)
    fs.writeFileSync(path.join(output, 'stdout.log'), result.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'shared RSC actual ' + kind)
    joined = true
    assert.equal(result.status, 0)
    const report = JSON.parse(
      fs.readFileSync(path.join(output, 'report.raw.json'), 'utf8')
    )
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 2)
    assert.equal(report.numPassedTests, 2)
    assert.equal(report.numFailedTests, 0)
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    assert.deepEqual(
      cases.map((value) => ({
        fullName: value.fullName,
        status: value.status,
        failureMessages: value.failureMessages,
      })),
      [
        {
          fullName:
            'first shared RSC file retains its actual request and shared module',
          status: 'passed',
          failureMessages: [],
        },
        {
          fullName:
            'second shared RSC file retains its own request and the same module',
          status: 'passed',
          failureMessages: [],
        },
      ]
    )
    const rows = []
    for (const line of result.stdout.split('\n')) {
      const at = line.indexOf('SHARED_RSC_ROW ')
      if (at >= 0)
        rows.push(JSON.parse(line.slice(at + 'SHARED_RSC_ROW '.length)))
    }
    save('OBSERVED.json', { cases, rows })
    assert.deepEqual(
      rows.map((value) => value.file),
      ['first', 'second']
    )
    assert.deepEqual(
      rows.map((value) => value.row.subject.version),
      ['A', 'A']
    )
    assert.deepEqual(
      rows.map((value) => value.row.subject.count),
      [1, 2]
    )
    save('RESULT.json', {
      cases: cases.length,
      files: report.testResults.length,
      sharedCounts: rows.map((value) => value.row.subject.count),
    })
    complete = true
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save('CLOSED.json', {
      joined,
      complete,
      fixtureRemoved: !fs.existsSync(fixture),
    })
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runSharedRsc(
    process.argv[2],
    process.argv[3],
    process.argv[4],
    process.argv[5]
  )
  console.log(
    fs
      .readFileSync(
        path.join(path.resolve(process.argv[3]), 'RESULT.json'),
        'utf8'
      )
      .trim()
  )
}
