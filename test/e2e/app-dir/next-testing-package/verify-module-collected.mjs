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
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const profiles = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/module-collected/pristine.json'
    ),
    'utf8'
  )
)
assert(!existsSync(output), 'existing evidence must not be overwritten')
mkdirSync(output, { recursive: true })
const checks = []
const projection = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'actor' && key !== 'id')
  )
for (const {
  profile,
  workers,
  sourceFiles,
  config,
  reporter,
  expected,
} of profiles) {
  const out = join(output, profile),
    fixture = join(consumer, '.next-test-module-collected-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  for (const [file, body] of Object.entries(sourceFiles))
    writeFileSync(join(fixture, file), body)
  writeFileSync(join(fixture, 'reporter.mjs'), reporter)
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({ test: { ...config.test, mode, environment: 'node' } }) +
      '\n'
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
      assert(!completed, 'run closed before owned collected observation')
      await delay(10)
    }
    throw Error('collected observation deadline')
  }
  const names = Object.keys(sourceFiles).filter((file) =>
    file.endsWith('.case.mjs')
  )
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
      assert(!rows().some((row) => row.event === 'collected-return'))
      writeFileSync(
        join(out, 'BODY-WHILE-COLLECTED-HELD.json'),
        JSON.stringify(rows(), null, 2) + '\n'
      )
    }
    for (const file of first) writeFileSync(join(releases, file), 'release')
    if (workers === 1 && names.length === 2) {
      const second = await until(() => {
        const files = readdirSync(markers)
        return files.length === 2
          ? files.find((file) => !first.includes(file))
          : undefined
      })
      writeFileSync(join(releases, second), 'release')
    }
    const result = await running
    assertOwnedNodeCompleted(
      result,
      'collected reporter ' + mode + ' ' + profile
    )
    assert.equal(result.status, expected.status, result.stderr)
    const observed = rows()
    for (const event of ['collected', 'end']) {
      const actual = observed.filter((row) => row.event === event)
      assert.deepEqual(
        actual.map(projection).sort((a, b) => a.file.localeCompare(b.file)),
        expected[event].toSorted((a, b) => a.file.localeCompare(b.file))
      )
      for (const row of actual) {
        assert.equal(typeof row.id, 'string')
        const queued = observed.find(
          (value) => value.event === 'queued' && value.file === row.file
        )
        assert(queued)
        assert.equal(row.id, queued.id)
        assert(observed.indexOf(queued) < observed.indexOf(row))
      }
    }
    const finish = observed.find((row) => row.event === 'run-end')
    assert(finish)
    const projected = projection(finish)
    projected.modules = projected.modules
      .map(({ id, ...module }) => module)
      .sort((a, b) => a.file.localeCompare(b.file))
    assert.deepEqual(projected, {
      ...expected.runEnd,
      modules: expected.runEnd.modules.toSorted((a, b) =>
        a.file.localeCompare(b.file)
      ),
    })
    for (const row of observed.filter(
      (value) => value.event === 'collected-return'
    ))
      assert(observed.indexOf(row) < observed.indexOf(finish))
    if (profile === 'held-body')
      assert(
        observed.findIndex((row) => row.event === 'body') <
          observed.findIndex((row) => row.event === 'collected-return')
      )
    const report = JSON.parse(readFileSync(join(out, 'cases.json'), 'utf8'))
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
    checks.push({
      profile,
      status: result.status,
      collectedModules: expected.collected.length,
      actualLiveIdentityAndStateEqual: true,
      standardStableReportEqual: true,
      allOwnersJoined: true,
    })
    writeFileSync(
      join(out, 'OBSERVED.json'),
      JSON.stringify({ rows: observed, checks: checks.at(-1) }, null, 2) + '\n'
    )
  } finally {
    for (const name of names) writeFileSync(join(releases, name), 'release')
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
