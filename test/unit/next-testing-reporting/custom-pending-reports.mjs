import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runCompletion } from './custom-completion-fixture.mjs'

export function checkPending({ name, trace, publication, stderr }) {
  assert.deepEqual(
    trace.map((row) => row.name),
    [
      'first-enter',
      'second-enter',
      'first-close',
      name.includes('reject') ? 'first-rejected' : 'first-settled',
    ]
  )
  for (const row of trace) assert.equal(row.jsonExists, false)
  assert.equal(publication, 'none')
  assert(stderr.includes('actual113 reporter failure'), stderr)
  if (name.includes('reject'))
    assert(stderr.includes('prior async rejection116'), stderr)
  if (name.includes('close-throw'))
    assert(stderr.includes('actual close failure116'), stderr)
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runCompletion('pending', checkPending)
