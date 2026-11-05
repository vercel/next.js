import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runCompletion } from './custom-completion-fixture.mjs'

export function checkSyncJSON({ name, trace, publication, stderr, priorJSON }) {
  assert.deepEqual(
    trace.map((row) => row.name),
    ['modern-enter']
  )
  assert.equal(trace[0].jsonExists, priorJSON)
  const synchronousBeforeJSON = name.startsWith('cli-sync-before')
  assert.equal(
    publication,
    synchronousBeforeJSON ? (priorJSON ? 'preserved' : 'none') : 'written'
  )
  assert(stderr.includes('actual113 reporter failure'), stderr)
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runCompletion('sync-json', checkSyncJSON)
