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
import { join, basename, dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumer, output, mode = 'development'] = process.argv.slice(2)
assert(consumer && output, 'consumer and output required')
assert(['development', 'production'].includes(mode), 'known execution mode')
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/config-file-parallelism'
)
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const reference = JSON.parse(
  readFileSync(join(source, 'pristine-' + mode + '.json'), 'utf8')
)
mkdirSync(output)
const summary = []
for (const profile of reference) {
  const out = join(output, profile.name)
  mkdirSync(out, { recursive: true })
  assert(
    !existsSync(join(out, 'RESULT.json')),
    'retained proof cannot be overwritten'
  )
  const fixture = join(consumer, '.next-test-file-parallelism-' + randomUUID())
  mkdirSync(fixture)
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  for (const file of ['a', 'b'])
    writeFileSync(
      join(fixture, file + '.case.mjs'),
      readFileSync(join(source, file + '.case.mjs.txt'))
    )
  const authoredParallelism = profile.authoredParallelism
  const format =
    profile.name === 'configured-false' || profile.name === 'configured-true'
      ? 'executable'
      : 'json'
  const project = {
    name: 'default',
    environment: 'node',
    mode,
    include: ['*.case.mjs'],
    testTimeout: 60000,
    sequence: { seed: 1 },
  }
  const config = { maxWorkers: 2, cache: false, projects: [project] }
  if (authoredParallelism !== undefined)
    config.fileParallelism = authoredParallelism
  if (format === 'json')
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify(config) + '\n'
    )
  else {
    const test = { maxWorkers: 2, cache: false, ...project }
    if (authoredParallelism !== undefined)
      test.fileParallelism = authoredParallelism
    writeFileSync(
      join(fixture, 'vitest.config.mjs'),
      'export default ' + JSON.stringify({ test }) + '\n'
    )
  }
  const markers = join(out, 'markers'),
    gate = join(out, 'release'),
    trace = join(out, 'trace.jsonl')
  mkdirSync(markers)
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FILE_PARALLELISM_MARKERS: markers,
    FILE_PARALLELISM_GATE: gate,
    FILE_PARALLELISM_TRACE: trace,
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  delete env.CI
  let completed
  const running = runOwnedNode(
    [
      cli,
      'test',
      fixture,
      '--reporter=json',
      '--outputFile',
      join(out, 'cases.json'),
      ...profile.flags,
    ],
    { cwd: fixture, env, auditDir: join(out, 'processes'), timeoutMs: 180000 }
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
  let failure
  try {
    if (profile.rejectedBeforeBody) {
      const result = await running
      assertOwnedNodeCompleted(result, 'Next duplicate file flag refusal')
      assert.equal(result.status, 1)
      assert(result.stderr.includes(profile.expectedMessage))
      assert.equal(readdirSync(markers).length, 0)
      assert(!existsSync(join(out, 'cases.json')))
      summary.push({
        name: profile.name,
        mode,
        rejectedBeforeBody: true,
        exactMessage: profile.expectedMessage,
        allOwnersJoined: true,
      })
      continue
    }
    const deadline = Date.now() + 60000
    while (readdirSync(markers).length < profile.barrierBeforeRelease) {
      assert(!completed, 'Next closed before actual worker barrier')
      assert(Date.now() < deadline, 'actual worker barrier deadline')
      await delay(10)
    }
    writeFileSync(gate, 'release')
    const result = await running
    assertOwnedNodeCompleted(
      result,
      'Next file parallelism ' + mode + '/' + profile.name
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(readFileSync(join(out, 'cases.json'), 'utf8'))
    assert.equal(report.numPassedTests, 2)
    assert.equal(report.numFailedTests, 0)
    const cases = report.testResults.map((file) => ({
      file: basename(file.name),
      cases: file.assertionResults.map(
        ({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        })
      ),
    }))
    assert.deepEqual(cases, profile.cases)
    const rows = readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse)
    const active = new Set()
    let maximum = 0
    for (const row of rows) {
      if (row.phase === 'start') active.add(row.file)
      else assert(active.delete(row.file))
      maximum = Math.max(maximum, active.size)
    }
    assert.equal(active.size, 0)
    assert.equal(maximum, profile.actualMaximumActiveFiles)
    for (const file of ['a', 'b'])
      assert.deepEqual(
        rows.filter((row) => row.file === file),
        profile.rows.filter((row) => row.file === file)
      )
    const receipt = {
      name: profile.name,
      mode,
      format,
      cases,
      rows,
      actualMaximumActiveFiles: maximum,
      actualBarrierBeforeRelease: profile.barrierBeforeRelease,
      exactGenuineCaseFileProjection: true,
      exactPerFileRows: true,
      allOwnersJoined: true,
    }
    writeFileSync(
      join(out, 'VERIFIED.json'),
      JSON.stringify(receipt, null, 2) + '\n'
    )
    summary.push(receipt)
  } catch (error) {
    failure = error
    writeFileSync(
      join(out, 'FAILURE.json'),
      JSON.stringify({ message: error.message, stack: error.stack }, null, 2) +
        '\n'
    )
  } finally {
    if (!existsSync(gate)) writeFileSync(gate, 'release')
    await running
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(output, 'SUMMARY.json'),
      JSON.stringify(summary, null, 2) + '\n'
    )
  }
  if (failure) throw failure
}
const verified = {
  mode,
  functionalProfiles: summary.filter((row) => row.cases).length,
  negativeProfiles: summary.filter((row) => row.rejectedBeforeBody).length,
  allOwnersJoined: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(verified, null, 2) + '\n'
)
console.log(JSON.stringify(verified))
