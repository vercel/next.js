import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { runOwnedNode, assertOwnedNodeCompleted } = await import(
  pathToFileURL(process.argv[2]).href
)
const { readResultEvents, assertSuccessfulRun } = await import(
  pathToFileURL(resolve(process.argv[2], '../result-event-verifier.mjs')).href
)
const eventLog = resolve('l3-production-events.jsonl')
const result = await runOwnedNode(
  [
    resolve('node_modules/next/dist/bin/next'),
    'test',
    '--run',
    '--project',
    'production-node',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import=${JSON.stringify(pathToFileURL(resolve(process.argv[2], '../result-events.cjs')).href)}`,
      ]
        .filter(Boolean)
        .join(' '),
      NEXT_TEST_EVENT_AUDIT: eventLog,
    },
    auditDir: resolve('l3-production-audit'),
    timeoutMs: 180000,
  }
)
writeFileSync('l3-production-result.json', JSON.stringify(result, null, 2))
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
assertOwnedNodeCompleted(result, 'L3 production Node')
assert.equal(result.status, 0)
assertSuccessfulRun(readResultEvents(eventLog), { files: 2, cases: 2 })
