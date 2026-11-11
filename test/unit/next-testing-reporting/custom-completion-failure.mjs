import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runCompletion } from './custom-completion-fixture.mjs'

export function checkCompletionFailure({ name, trace, publication, stderr }) {
  const zero = name.startsWith('zero-')
  const getter = name.endsWith('-getter')
  assert.deepEqual(
    trace.map((row) => row.name),
    [
      ...(name.startsWith('plain-') ? ['first-enter'] : []),
      ...(getter ? [zero ? 'modern-getter' : 'second-getter'] : []),
      ...(!zero ? ['first-close'] : []),
    ]
  )
  for (const row of trace) assert.equal(row.jsonExists, false)
  assert.equal(publication, 'none')
  const message = getter
    ? zero
      ? 'actual113 reporter failure'
      : 'actual access failure118'
    : 'Custom reporter onTestRunEnd is not a function.'
  assert(stderr.includes(message), stderr)
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runCompletion('completion-failure', checkCompletionFailure)
