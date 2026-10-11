import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { runOwnedNode, assertOwnedNodeCompleted } = await import(
  pathToFileURL(process.argv[2]).href
)
const result = await runOwnedNode([resolve('run-rsc-producer.cjs')], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production' },
  auditDir: resolve('l3-rsc-producer-audit'),
  timeoutMs: 180000,
})
writeFileSync('l3-rsc-producer-result.json', JSON.stringify(result, null, 2))
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
assertOwnedNodeCompleted(result, 'internal production RSC')
assert.equal(result.status, 0)
