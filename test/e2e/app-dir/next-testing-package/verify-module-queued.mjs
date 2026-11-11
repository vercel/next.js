import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumer, output, mode = 'development'] = process.argv.slice(2)
assert(consumer && output)
assert(['development', 'production'].includes(mode))
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/module-queued'
)
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const reference = JSON.parse(
  readFileSync(join(source, 'pristine.json'), 'utf8')
)
assert(!existsSync(output), 'existing evidence must not be overwritten')
mkdirSync(output, { recursive: true })
const checks = []
for (const expected of reference) {
  const { profile, workers } = expected
  const names =
    profile.startsWith('success') || profile === 'selection'
      ? ['a', 'b']
      : ['a']
  const out = join(output, profile)
  mkdirSync(out)
  const fixture = join(consumer, '.next-test-module-queued-' + randomUUID())
  mkdirSync(fixture)
  writeFileSync(
    join(fixture, 'package.json'),
    readFileSync(join(source, 'package.json.txt'))
  )
  for (const file of ['setup.mjs', 'dependency.mjs'])
    writeFileSync(
      join(fixture, file),
      readFileSync(join(source, file + '.txt'))
    )
  for (const name of names) {
    const input =
      profile === 'load-failure' || profile === 'syntax-failure'
        ? profile + '.mjs.txt'
        : name + '.case.mjs.txt'
    writeFileSync(
      join(fixture, name + '.case.mjs'),
      readFileSync(join(source, input))
    )
  }
  writeFileSync(
    join(fixture, 'reporter.mjs'),
    readFileSync(join(source, 'reporter-' + profile + '.mjs.txt'))
  )
  const config = {
    test: {
      include: ['*.case.mjs'],
      setupFiles: ['./setup.mjs'],
      maxWorkers: workers,
      cache: false,
      testTimeout: 10000,
      sequence: { seed: 1 },
      mode,
      environment: 'node',
    },
  }
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' + JSON.stringify(config) + '\n'
  )
  const markers = join(out, 'queued'),
    releases = join(out, 'release'),
    trace = join(out, 'trace.jsonl')
  mkdirSync(markers)
  mkdirSync(releases)
  const env = {
    ...process.env,
    NODE_ENV: mode,
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    QUEUED_TRACE: trace,
    QUEUED_MARKERS: markers,
    QUEUED_RELEASE: releases,
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  let completed
  const running = runOwnedNode(
    [
      cli,
      'test',
      fixture,
      ...(profile === 'selection' ? ['--filter', 'a.case.mjs'] : []),
      '--reporter=./reporter.mjs',
      '--reporter=json',
      '--outputFile=' + join(out, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(out, 'processes'), timeoutMs: 120000 }
  ).then((result) => {
    completed = result
    writeFileSync(
      join(out, 'RESULT.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    writeFileSync(join(out, 'stdout.log'), result.stdout)
    writeFileSync(join(out, 'stderr.log'), result.stderr)
    return result
  })
  const rows = () =>
    existsSync(trace)
      ? readFileSync(trace, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse)
      : []
  async function until(read) {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      const value = read()
      if (value !== undefined) return value
      assert(!completed, 'run closed before owned queued observation')
      await delay(10)
    }
    throw new Error('queued observation deadline')
  }
  try {
    const first = await until(() => {
      const files = readdirSync(markers)
      return files.length >= workers ? files : undefined
    })
    if (profile === 'held-body') {
      await until(() =>
        rows().some((row) => row.actor === 'author' && row.event === 'body')
          ? true
          : undefined
      )
      assert(!rows().some((row) => row.event === 'queued-return'))
      writeFileSync(
        join(out, 'BODY-WHILE-QUEUED-HELD.json'),
        JSON.stringify(rows(), null, 2) + '\n'
      )
    }
    for (const file of first) writeFileSync(join(releases, file), 'release')
    if (workers === 1 && names.length === 2 && profile !== 'selection') {
      const second = await until(() => {
        const files = readdirSync(markers)
        return files.length === 2
          ? files.find((file) => !first.includes(file))
          : undefined
      })
      writeFileSync(join(releases, second), 'release')
    }
    const result = await running
    assertOwnedNodeCompleted(result, 'queued reporter ' + mode + ' ' + profile)
    assert.equal(result.status, expected.status, result.stderr)
    const observed = rows()
    const actualQueued = observed.filter((row) => row.event === 'queued')
    assert.equal(actualQueued.length, expected.queued.length)
    for (const queued of expected.queued) {
      const actual = actualQueued.find((row) => row.file === queued.file)
      assert(actual)
      assert.deepEqual(
        Object.fromEntries(
          Object.keys(queued).map((key) => [key, actual[key]])
        ),
        queued
      )
      assert.equal(typeof actual.id, 'string')
      for (const returned of observed.filter(
        (row) => row.event === 'queued-return' && row.file === queued.file
      )) {
        assert.equal(returned.id, actual.id)
        assert.deepEqual(
          Object.fromEntries(
            Object.keys(queued).map((key) => [key, returned[key]])
          ),
          queued
        )
      }
      for (const end of observed.filter(
        (row) => row.event === 'end' && row.file === queued.file
      )) {
        assert.equal(end.id, actual.id)
        assert.equal(end.same, false)
        if ('queuedState' in end) assert.equal(end.queuedState, 'pending')
        if ('queuedChildren' in end) assert.equal(end.queuedChildren, 0)
      }
    }
    const finish = observed.find((row) => row.event === 'run-end')
    assert(finish)
    assert.equal(
      finish.reason,
      profile === 'load-failure' || profile === 'syntax-failure'
        ? 'failed'
        : 'passed'
    )
    assert.deepEqual(
      finish.errors,
      profile === 'queue-reject' ? ['owned queued reporter failure'] : []
    )
    if (profile === 'held-body')
      assert(
        observed.findIndex((row) => row.event === 'body') <
          observed.findIndex((row) => row.event === 'queued-return')
      )
    const report = JSON.parse(readFileSync(join(out, 'cases.json'), 'utf8'))
    if (expected.stableReport) {
      const stable = {
        counts: Object.fromEntries(
          Object.entries(report).filter(
            ([key]) => key.startsWith('num') || key === 'success'
          )
        ),
        files: report.testResults
          .map((file) => ({
            name: basename(file.name),
            status: file.status,
            message: file.message,
            assertionResults: file.assertionResults.map(
              ({ duration, ...assertion }) => assertion
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }
      assert.deepEqual(stable, expected.stableReport)
    } else {
      assert.equal(report.numTotalTests, 0)
      assert.equal(report.numFailedTestSuites, 1)
    }
    checks.push({
      profile,
      status: result.status,
      queuedModules: actualQueued.length,
      standardStableReportEqual: !!expected.stableReport,
      allOwnersJoined: true,
    })
    writeFileSync(
      join(out, 'OBSERVED.json'),
      JSON.stringify({ rows: observed, checks: checks.at(-1) }, null, 2) + '\n'
    )
  } finally {
    for (const name of names)
      writeFileSync(join(releases, name + '.case.mjs'), 'release')
    await running
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      mode,
      profiles: checks.length,
      checks,
      allOwnersJoined: true,
      allInputsRemovedAfterOwnedReadersJoined: true,
    },
    null,
    2
  ) + '\n'
)
