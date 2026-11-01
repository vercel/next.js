import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <source-or-consumer-root> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg),
  directory = dirname(fileURLToPath(import.meta.url))
mkdirSync(output)
const expected = JSON.parse(
  readFileSync(join(directory, 'reference.json'), 'utf8')
)
const require = createRequire(join(consumer, 'package.json')),
  next = require.resolve('next/dist/bin/next')
const {
  mergeResultReports,
} = require('next/dist/experimental/testing/reporting/machine')
const save = (where, name, value) =>
  writeFileSync(join(where, name), JSON.stringify(value, null, 2) + '\n')
const sha = (value) => createHash('sha256').update(value).digest('hex'),
  authored = {}
for (const name of readdirSync(join(directory, 'cases')).sort()) {
  const bytes = readFileSync(join(directory, 'cases', name))
  assert.equal(sha(bytes), expected.inputs[name])
  authored[name.slice(0, -4)] = bytes
}
assert.equal(Object.keys(authored).length, 7)
save(output, 'inputs.json', {
  consumer,
  next: realpathSync(next),
  node: process.version,
  executable: realpathSync(process.execPath),
  inputs: expected.inputs,
  reference: expected.reference,
})
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
for (const name of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[name]
let allBodies = 0,
  allRows = 0,
  malformedInputs = 0
const packetProjection = (events) =>
  events
    .filter(
      (event) =>
        event.type === 'task-update' &&
        event.kind === 'task-packs-after-collection-failure'
    )
    .map((event) => ({
      kind: event.kind,
      entryId: event.entryId,
      revision: event.revision,
      taskUpdateIds: event.taskUpdateIds,
      taskPacks: event.taskPacks,
      caseResults: event.caseResults,
    }))
for (const mode of ['development', 'production']) {
  const evidence = join(output, mode),
    fixture = join(consumer, '.next-test-publication-receipts-' + randomUUID())
  mkdirSync(evidence)
  mkdirSync(fixture)
  mkdirSync(join(fixture, 'cases'))
  for (const [name, bytes] of Object.entries(authored))
    writeFileSync(join(fixture, 'cases', name), bytes)
  symlinkSync(
    join(consumer, 'node_modules'),
    join(fixture, 'node_modules'),
    'dir'
  )
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const test = {
    mode,
    environment: 'node',
    include: ['cases/*.test.mjs'],
    provide: { value: 0 },
    maxWorkers: 1,
    fileParallelism: false,
    cache: false,
    testTimeout: 5000,
    hookTimeout: 5000,
    retry: { count: 1, metadata: 'config' },
    outputFile: {
      json: join(evidence, 'report.json'),
      blob: join(evidence, 'blobs/result.json'),
    },
  }
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' + JSON.stringify({ test }) + '\n'
  )
  writeFileSync(
    join(fixture, 'reporter.mjs'),
    readFileSync(join(directory, 'reporter.mjs'))
  )
  const trace = join(evidence, 'rows.jsonl')
  writeFileSync(trace, '')
  let joined = false
  try {
    const args = [
      next,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=blob',
      '--reporter=' + join(fixture, 'reporter.mjs'),
    ]
    save(evidence, 'authored.json', {
      args,
      test,
      fixture,
      bounds: { cli: 180000, test: 5000, hook: 5000 },
    })
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env: {
        ...env,
        NODE_ENV: mode,
        NEXT_TESTING_PUBLICATION_RECEIPTS_TRACE: trace,
      },
      auditDir: join(evidence, 'owners'),
      timeoutMs: 180000,
    })
    save(evidence, 'result.json', result)
    writeFileSync(join(evidence, 'stdout.log'), result.stdout)
    writeFileSync(join(evidence, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'publication receipts ' + mode)
    joined = true
    assert.equal(
      result.status,
      1,
      'Real publication/receiver failures must keep the run failed'
    )
    const rows = readFileSync(trace, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const workerGroups = Object.fromEntries(
      Object.entries(
        rows
          .filter((row) => row.actor === 'worker')
          .reduce((groups, row) => {
            ;(groups[row.contract] ??= []).push(row)
            return groups
          }, {})
      ).sort(([a], [b]) => a.localeCompare(b))
    )
    save(evidence, 'worker-model.json', workerGroups)
    assert.deepEqual(
      workerGroups,
      expected.models[mode].workerGroups,
      'Every complete genuine worker-local row must match; public projection and run-error formatting remain separate'
    )
    assert.equal(
      rows.filter(
        (row) => row.actor === 'reporter' && row.phase === 'collected'
      ).length,
      0,
      'A rejected initial capture must not invent declarations'
    )
    const report = JSON.parse(
        readFileSync(join(evidence, 'report.json'), 'utf8')
      ),
      events = report.next.events
    assert.equal(report.success, false)
    const packs = packetProjection(events)
    assert(packs.length > 0)
    assert.equal(
      events.filter((event) => event.type === 'file-collected').length,
      0
    )
    assert(
      events
        .filter((event) => event.type === 'file-end')
        .every((event) => event.status === 'failed'),
      'No owned capture rejection may reach clean terminal completion'
    )
    const files = events.filter((event) => event.type === 'file-start')
    assert.equal(files.length, 7)
    for (const file of files) {
      assert(
        events.some(
          (event) =>
            event.type === 'diagnostic' &&
            event.entryId === file.entry.id &&
            event.diagnostic.severity === 'error'
        ),
        'Each real initial capture rejection must survive as an owned diagnostic'
      )
      const updates = events.filter(
        (event) =>
          event.type === 'task-update' && event.entryId === file.entry.id
      )
      assert(updates.length > 0)
      for (const update of updates) {
        assert.equal(update.kind, 'task-packs-after-collection-failure')
        assert(!Object.hasOwn(update, 'taskTree'))
        assert.deepEqual(
          update.taskUpdateIds,
          update.taskPacks.map(([id]) => id)
        )
        for (const [, pack] of update.taskPacks)
          assert(
            Object.keys(pack).every((key) => key === 'result' || key === 'meta')
          )
      }
    }
    const caseEnds = events.filter((event) => event.type === 'case-end')
    assert.equal(caseEnds.length, 7)
    assert(
      caseEnds.some(
        (event) =>
          event.status === 'failed' &&
          event.errors.some(
            (error) => error.message === 'actual publication body failure'
          )
      )
    )
    assert(
      events.some(
        (event) =>
          event.type === 'suite-end' &&
          event.errors.some(
            (error) => error.message === 'actual publication cleanup failure'
          )
      )
    )
    const reason = rows.find(
      (row) => row.actor === 'reporter' && row.phase === 'run-end'
    )
    assert(reason && reason.reason === 'failed')
    assert(
      reason.errors.length > 0,
      'Owned actual receiver failures must reach the existing reporter error owner'
    )
    save(evidence, 'actual-public-projection.json', {
      summary: Object.fromEntries(
        Object.entries(report).filter(
          ([key]) => key.startsWith('num') || key === 'success'
        )
      ),
      modules: rows.filter((row) => row.actor === 'reporter'),
      cases: report.testResults.flatMap((file) => file.assertionResults),
      explicitPhase3NotComparedToGenuine: true,
    })
    const mergeArgs = [
      next,
      'test',
      '--merge-reports',
      join(evidence, 'blobs'),
      '--reporter=json',
      '--outputFile=' + join(evidence, 'merged.json'),
    ]
    const mergedResult = await runOwnedNode(mergeArgs, {
      cwd: fixture,
      env: { ...env, NODE_ENV: mode },
      auditDir: join(evidence, 'merge-owners'),
      timeoutMs: 180000,
    })
    save(evidence, 'merge-result.json', mergedResult)
    writeFileSync(join(evidence, 'merge-stdout.log'), mergedResult.stdout)
    writeFileSync(join(evidence, 'merge-stderr.log'), mergedResult.stderr)
    assertOwnedNodeCompleted(mergedResult, 'publication packet merge ' + mode)
    assert.equal(mergedResult.status, 1)
    const merged = JSON.parse(
      readFileSync(join(evidence, 'merged.json'), 'utf8')
    )
    assert.equal(merged.success, false)
    assert.deepEqual(
      packetProjection(merged.next.events),
      packs,
      'Actual emitted result/meta-only packets must survive the public blob roundtrip intact'
    )
    const originalBlob = JSON.parse(
      readFileSync(join(evidence, 'blobs/result.json'), 'utf8')
    )
    const mutations = [
      [
        'duplicate-id',
        (event) => {
          event.taskPacks.push(structuredClone(event.taskPacks[0]))
          event.taskUpdateIds.push(event.taskUpdateIds[0])
        },
      ],
      [
        'unknown-kind',
        (event) => {
          event.kind = 'foreign-task-packs'
        },
      ],
      [
        'replacement-tree',
        (event) => {
          event.taskTree = { id: event.entryId }
        },
      ],
      [
        'unowned-packet-id',
        (event) => {
          event.taskPacks[0][0] = 'foreign-task'
        },
      ],
      [
        'invalid-meta',
        (event) => {
          event.taskPacks[0][1].meta = null
        },
      ],
      [
        'invalid-result',
        (event) => {
          event.taskPacks[0][1].result = { state: 'foreign-state' }
        },
      ],
      [
        'foreign-case-owner',
        (event) => {
          event.caseResults[0].entryId = 'foreign-entry'
        },
      ],
    ]
    for (const [name, mutate] of mutations) {
      const corrupted = structuredClone(originalBlob)
      const event = corrupted.events.find(
        (event) =>
          event.type === 'task-update' &&
          event.kind === 'task-packs-after-collection-failure' &&
          (name !== 'foreign-case-owner' || event.caseResults.length)
      )
      assert(event)
      mutate(event)
      const bad = join(evidence, 'malformed-' + name)
      mkdirSync(bad)
      writeFileSync(join(bad, 'result.json'), JSON.stringify(corrupted))
      const target = join(evidence, 'refusal-' + name + '.json'),
        sentinel = 'existing output must remain intact\n'
      writeFileSync(target, sentinel)
      let rejected = false,
        actualError
      try {
        await mergeResultReports(bad, {
          projectDir: fixture,
          reporters: ['json'],
          outputFile: target,
        })
      } catch (error) {
        rejected = true
        actualError = {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
        }
      }
      save(evidence, 'refusal-' + name + '-error.json', actualError)
      assert(
        rejected,
        'Malformed actual packet mutation must be refused: ' + name
      )
      assert.equal(readFileSync(target, 'utf8'), sentinel)
      malformedInputs++
    }
    allBodies += rows.filter(
      (row) => row.actor === 'worker' && row.event[0] === 'body'
    ).length
    allRows += Object.values(workerGroups).reduce(
      (sum, rows) => sum + rows.length,
      0
    )
    save(evidence, 'VERIFIED.json', {
      mode,
      actualBodies: 7,
      wholeWorkerRows: 32,
      completeGenuineWorkerModelExact: true,
      actualRawPacketRoundtripExact: true,
      malformedPacketInputsRefused: 7,
      allOwnersJoined: true,
      explicitPhase3ProjectionGap: true,
    })
  } finally {
    if (joined) rmSync(fixture, { recursive: true, force: true })
    save(evidence, 'closure.json', {
      allOwnersJoined: joined,
      fixtureAbsent: !existsSync(fixture),
    })
  }
}
save(output, 'VERIFIED.json', {
  profiles: 2,
  actualBodies: allBodies,
  wholeWorkerRows: allRows,
  completeGenuineWorkerModelsExact: true,
  actualRawPacketRoundtripsExact: true,
  malformedPacketInputsRefused: malformedInputs,
  allOwnersJoined: true,
  allInputsRemovedAfterReadersJoined: true,
  explicitPhase3PublicProjectionGap: true,
})
