import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [kind, root, output, selectedMode] = process.argv.slice(2)
assert(['source', 'installed'].includes(kind))
fs.mkdirSync(output)
const fixtures = new URL('./fixtures/snapshot-state/', import.meta.url)
const profiles = ['development', 'production'].flatMap((mode) =>
  ['success', 'failure', 'retry', 'counters'].map((group) => ({
    mode,
    group,
    body:
      group === 'retry'
        ? 'retry.test.mjs.txt'
        : group === 'counters'
          ? 'counters.test.mjs.txt'
          : 'lifecycle.test.mjs.txt',
  }))
)
const load = createRequire(root + '/package.json')
if (kind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next =
  kind === 'source'
    ? root + '/packages/next/dist/bin/next'
    : load.resolve('next/dist/bin/next')
const receipts = []
for (const e of profiles.filter(
  (e) => !selectedMode || e.mode === selectedMode
)) {
  const label = e.mode + '-' + e.group
  const body = fs.readFileSync(new URL(e.body, fixtures))
  const dir = output + '/' + label
  fs.mkdirSync(dir)
  const fixture = fs.mkdtempSync(root + '/.next-test-snapshot-state-')
  fs.writeFileSync(
    fixture + '/package.json',
    '{"private":true,"type":"module"}\n'
  )
  fs.writeFileSync(fixture + '/exposure.test.mjs', body)
  fs.symlinkSync(root + '/node_modules', fixture + '/node_modules', 'dir')
  const test = {
    include: ['exposure.test.mjs'],
    maxWorkers: 1,
    mode: e.mode,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
  }
  fs.writeFileSync(
    fixture + '/next.test.config.json',
    JSON.stringify({ test }) + '\n'
  )
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  let joined = false
  try {
    const env = {
      ...process.env,
      NODE_ENV: e.mode,
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      SNAPSHOT_EXPOSURE_TRACE: dir + '/trace.jsonl',
      SNAPSHOT_PHASE_FAIL: e.group === 'failure' ? '1' : '0',
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const report = dir + '/report.json'
    const args = [
      next,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + report,
    ]
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: dir + '/owners',
      timeoutMs: 120000,
    })
    fs.writeFileSync(dir + '/owner.json', JSON.stringify(owner, null, 2) + '\n')
    fs.writeFileSync(dir + '/stdout.log', owner.stdout)
    fs.writeFileSync(dir + '/stderr.log', owner.stderr)
    assertOwnedNodeCompleted(owner, label + ' snapshotState exposure')
    joined = true
    const json = JSON.parse(fs.readFileSync(report)),
      rows = fs
        .readFileSync(dir + '/trace.jsonl', 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
    const failed = e.group === 'failure'
    assert.equal(owner.status, failed ? 1 : 0)
    assert.equal(json.success, !failed)
    assert.equal(json.numTotalTests, 2)
    assert.equal(json.numPassedTests, failed ? 1 : 2)
    assert.equal(json.numFailedTests, failed ? 1 : 0)
    assert.equal(json.snapshot.matched, 2)
    assert.equal(json.snapshot.total, 2)
    assert.equal(json.snapshot.unmatched, 0)
    assert.equal(json.snapshot.added, 0)
    assert.equal(json.snapshot.updated, 0)
    assert.equal(json.snapshot.didUpdate, false)
    const first = [
      'before-each',
      'first-body-enter',
      'first-body-after-snapshot',
      'after-each',
    ]
    assert.deepEqual(
      rows.map((row) => row.phase),
      [
        'collection',
        'before-all',
        ...first,
        ...(e.group === 'retry' ? first : []),
        'before-each',
        'second-body-enter',
        'second-body-after-snapshot',
        'after-each',
        'after-all',
      ]
    )
    for (const row of rows) {
      assert.equal(row.sameGlobalState, true)
      const active = !['collection', 'before-all'].includes(row.phase)
      assert.equal(row.ownSnapshot, active)
      assert.equal(row.snapshotPresent, active)
      if (!active) {
        assert.equal(row.descriptor, null)
        assert.equal(row.sameActualSnapshot, null)
        continue
      }
      assert.equal(row.sameActualSnapshot, true)
      assert.equal(row.constructorName, 'SnapshotState')
      assert.deepEqual(row.descriptor, {
        enumerable: true,
        configurable: true,
        writable: true,
        valueType: 'object',
      })
      assert.deepEqual(
        row.local,
        row.phase === 'after-all'
          ? null
          : {
              sameState: false,
              snapshotPresent: true,
              sameSnapshot: true,
            }
      )
    }
    if (e.group === 'counters') {
      let matched = 0
      for (const row of rows.slice(2)) {
        if (row.phase.endsWith('after-snapshot')) matched++
        assert.deepEqual(row.counters, { added: 0, matched, unmatched: 0 })
      }
    }
    assert.deepEqual(fs.readFileSync(fixture + '/exposure.test.mjs'), body)
    assert.equal(fs.existsSync(fixture + '/__snapshots__'), false)
    const cases = json.testResults
      .flatMap((f) => f.assertionResults)
      .map((c) => ({ name: c.fullName, status: c.status }))
    assert.deepEqual(cases, [
      {
        name: 'first real state',
        status: e.group === 'failure' ? 'failed' : 'passed',
      },
      { name: 'second real state', status: 'passed' },
    ])
    receipts.push({
      label,
      kind,
      status: owner.status,
      cases: 2,
      observations: rows.length,
      lifecycleAndSnapshotCounters: true,
      actualSnapshotObjectAndDescriptors: true,
      bodyAndInlineSnapshotsUnchanged: true,
      ownersJoined: true,
    })
    fs.writeFileSync(
      output + '/VERIFIED.json',
      JSON.stringify(
        { node: process.version, profiles: receipts.length, receipts },
        null,
        2
      ) + '\n'
    )
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
assert.equal(receipts.length, selectedMode ? 4 : 8)
console.log(
  JSON.stringify({
    profiles: receipts.length,
    cases: receipts.length * 2,
    observations: receipts.reduce((sum, r) => sum + r.observations, 0),
    lifecycleAndSnapshotCounters: true,
    sourceAndInlineSnapshotsUnchanged: true,
    allOwnersJoined: true,
  })
)
