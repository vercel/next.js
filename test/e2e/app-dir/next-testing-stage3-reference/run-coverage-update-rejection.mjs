import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { runOwnedNode, assertOwnedNodeCompleted } = await import(
  pathToFileURL(process.argv[2]).href
)
const configPath = resolve('next.test.config.json')
const snapshotPath = resolve('coverage/__snapshots__/snapshot.case.mjs.snap')
const originalConfig = readFileSync(configPath)
const originalSnapshot = readFileSync(snapshotPath)
try {
  writeFileSync(
    configPath,
    JSON.stringify({
      compatibility: 'vitest',
      projects: [
        {
          name: 'snapshot-rejection',
          mode: 'development',
          environment: 'node',
          include: ['coverage/snapshot.case.mjs'],
        },
      ],
    })
  )
  const result = await runOwnedNode(
    [
      resolve('node_modules/next/dist/bin/next'),
      'test',
      '--coverage',
      '--update',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development' },
      auditDir: resolve('l3-coverage-update-audit'),
      timeoutMs: 30000,
    }
  )
  writeFileSync(
    'l3-coverage-update-result.json',
    JSON.stringify(result, null, 2)
  )
  assertOwnedNodeCompleted(result, 'coverage/snapshot rejection')
  assert.equal(result.status, 1)
  assert.match(
    result.stdout + result.stderr,
    /--coverage cannot be combined with --update/
  )
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /L3_UNEXPECTED_COVERAGE_SNAPSHOT_BODY/
  )
  assert.deepEqual(readFileSync(snapshotPath), originalSnapshot)
} finally {
  writeFileSync(configPath, originalConfig)
}
