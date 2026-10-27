import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [kind, root, output, selectedMode] = process.argv.slice(2)
assert(['source', 'installed'].includes(kind))
fs.mkdirSync(output)
const fixtures = new URL('./fixtures/snapshot-state/', import.meta.url)
const expected = JSON.parse(
  fs.readFileSync(new URL('reference.json', fixtures))
)
const load = createRequire(root + '/package.json')
if (kind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next =
  kind === 'source'
    ? root + '/packages/next/dist/bin/next'
    : load.resolve('next/dist/bin/next')
const digest = (body) => createHash('sha256').update(body).digest('hex')
const receipts = []
for (const [label, e] of Object.entries(expected).filter(
  ([, e]) => !selectedMode || e.mode === selectedMode
)) {
  const body = fs.readFileSync(new URL(e.body, fixtures))
  assert.equal(digest(body), e.bodySHA256)
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
    const standard = {
      success: json.success,
      counts: Object.fromEntries(
        Object.entries(json).filter(([k]) => k.startsWith('num'))
      ),
      snapshot: json.snapshot,
      files: json.testResults.map((f) => ({
        status: f.status,
        message: f.message,
      })),
    }
    assert.equal(owner.status, e.status)
    assert.deepEqual(rows, e.rows)
    assert.deepEqual(standard, e.standard)
    assert.equal(
      digest(fs.readFileSync(fixture + '/exposure.test.mjs')),
      e.bodySHA256
    )
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
      sourceSHA256: e.bodySHA256,
      status: owner.status,
      cases: 2,
      observations: rows.length,
      exactGenuineStateRows: true,
      completeStandardProjection: true,
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
    exactGenuineStateAndSnapshotCounters: true,
    sourceAndInlineSnapshotsUnchanged: true,
    allOwnersJoined: true,
  })
)
