import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runCompletion } from './custom-completion-fixture.mjs'

export function checkDispatch({ name, trace, publication, stderr }) {
  assert.deepEqual(
    trace.map((row) => row.name),
    [
      'first-enter',
      ...([
        'first-async',
        'json-between-second-sync',
        'json-after-second-sync',
      ].includes(name)
        ? ['second-enter']
        : []),
    ]
  )
  for (const row of trace) assert.equal(row.jsonExists, false)
  assert.equal(
    publication,
    ['first-sync', 'json-after-second-sync'].includes(name) ? 'none' : 'written'
  )
  assert(stderr.includes('actual113 reporter failure'), stderr)
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runCompletion('dispatch', checkDispatch)
